"use client";
import { useEffect, useRef, useState } from "react";
import { Microphone } from "./audio";

export function usePoolMic(report: (message: string) => void) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [gain, setGain] = useState(100);
  const [echo, setEcho] = useState(0);
  const [reverb, setReverb] = useState(0);
  const [monitor, setMonitor] = useState(false);
  const graph = useRef<Microphone | null>(null);
  const request = useRef(0);
  const alive = useRef(true);
  const allowed = useRef(false);
  const volumes = useRef({ gain, echo, reverb, monitor }); volumes.current = { gain, echo, reverb, monitor };

  useEffect(() => {
    alive.current = true;
    const enumerate = async () => {
      try { const list = await navigator.mediaDevices?.enumerateDevices(); if (alive.current) setDevices((list || []).filter(d => d.kind === "audioinput")); } catch { /* Request permission when connecting. */ }
    };
    void enumerate(); navigator.mediaDevices?.addEventListener("devicechange", enumerate);
    return () => { alive.current = false; request.current++; graph.current?.close(); graph.current = null; navigator.mediaDevices?.removeEventListener("devicechange", enumerate); };
  }, []);
  function disconnect() {
    request.current++; graph.current?.close(); graph.current = null;
    setStream(null); setBusy(false);
  }
  async function connect() {
    if (!window.isSecureContext) { report("Microphone access is blocked on this HTTP address. On this computer, open http://localhost:3000. On a TV or phone, use a trusted HTTPS address."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { report("Microphone access needs HTTPS or localhost and a supported browser."); return; }
    const id = ++request.current; setBusy(true);
    let input: MediaStream | null = null, next: Microphone | null = null;
    try {
      input = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: device ? { exact: device } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      if (!alive.current || request.current !== id) { input.getTracks().forEach(t => t.stop()); return; }
      next = new Microphone(input);
      next.mute(true); // Connect muted; unmuting requires a separate explicit action.
      await next.context.resume();
      if (!alive.current || request.current !== id) { next.close(); return; }
      const current = volumes.current;
      next.gain.gain.value = current.gain / 100;
      next.echo.gain.value = current.echo / 100 * 0.65;
      next.reverb.gain.value = current.reverb / 100 * 0.7;
      next.monitor.gain.value = current.monitor && allowed.current ? 1 : 0;
      graph.current?.close(); graph.current = next;
      next.mute(!allowed.current);
      setStream(next.output.stream);
      input.getAudioTracks()[0].onended = () => {
        if (graph.current === next) { disconnect(); report("Your microphone disconnected. Choose another device and connect again."); }
      };
      const list = await navigator.mediaDevices.enumerateDevices(); if (alive.current) setDevices(list.filter(d => d.kind === "audioinput"));
    } catch (error) {
      next?.close(); input?.getTracks().forEach(t => t.stop());
      if (alive.current && request.current === id) report(error instanceof DOMException && error.name === "NotAllowedError" ? "Allow microphone access in your browser’s site settings and try again." : "Could not connect this microphone. Check the selected device and try again.");
    } finally { if (alive.current && request.current === id) setBusy(false); }
  }
  function setAllowed(value: boolean) {
    allowed.current = value;
    const g = graph.current;
    if (g) { g.mute(!value); g.monitor.gain.value = value && volumes.current.monitor ? 1 : 0; }
  }
  useEffect(() => {
    const g = graph.current; if (!g) return;
    g.gain.gain.setTargetAtTime(gain / 100, g.context.currentTime, 0.02);
    g.echo.gain.setTargetAtTime(echo / 100 * 0.65, g.context.currentTime, 0.02);
    g.reverb.gain.setTargetAtTime(reverb / 100 * 0.7, g.context.currentTime, 0.02);
    g.monitor.gain.value = monitor && allowed.current ? 1 : 0;
  }, [gain, echo, reverb, monitor]);
  return { stream, busy, devices, device, setDevice, gain, setGain, echo, setEcho, reverb, setReverb, monitor, setMonitor, connect, disconnect, setAllowed };
}
