"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Square, Volume2 } from "lucide-react";
import type { Microphone } from "@/lib/audio";
import { MAX_SONG_DELAY_MS, liveMix } from "@/lib/live-mix";

declare global { interface Window { encoreLiveMix?: MediaStream | null } }
type Props = { microphone: Microphone | null; muted: boolean; hasSong: boolean; onCaptureChange: (active: boolean) => void };
type CaptureOptions = DisplayMediaStreamOptions & { preferCurrentTab: boolean; selfBrowserSurface: "include"; systemAudio: "exclude"; surfaceSwitching: "exclude" };
type Session = { close: () => void; setDelay: (milliseconds: number) => void };

export function LiveAudience({ microphone, muted, hasSong, onCaptureChange }: Props) {
  const [delay, setDelay] = useState(150);
  const [status, setStatus] = useState<"idle" | "choosing" | "live">("idle");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(false);
  const session = useRef<Session | null>(null);
  const popup = useRef<Window | null>(null);
  const request = useRef(0);
  const alive = useRef(true);
  const captureHandle = useRef("");
  const latest = useRef({ microphone, onCaptureChange }); latest.current = { microphone, onCaptureChange };

  function stop() {
    request.current++;
    const current = session.current; session.current = null;
    current?.close(); window.encoreLiveMix = null;
    if (alive.current) { setStatus("idle"); latest.current.onCaptureChange(false); }
  }
  useEffect(() => {
    alive.current = true;
    setSupported(typeof navigator.mediaDevices?.getDisplayMedia === "function");
    const captureDevices = navigator.mediaDevices as MediaDevices & { setCaptureHandleConfig?: (config: { handle: string; permittedOrigins: string[] }) => void };
    if (captureDevices?.setCaptureHandleConfig) {
      try {
        captureHandle.current = crypto.randomUUID();
        captureDevices.setCaptureHandleConfig({ handle: captureHandle.current, permittedOrigins: [location.origin] });
      } catch { captureHandle.current = ""; }
    }
    return () => {
      alive.current = false; request.current++;
      session.current?.close(); session.current = null; window.encoreLiveMix = null;
      popup.current?.close();
      try { captureDevices?.setCaptureHandleConfig?.({ handle: "", permittedOrigins: [] }); } catch { /* Optional browser capability. */ }
      latest.current.onCaptureChange(false);
    };
  }, []);
  useEffect(() => { stop(); }, [microphone, hasSong]);
  useEffect(() => { session.current?.setDelay(delay); }, [delay]);
  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => {
      if (popup.current?.closed) { popup.current = null; stop(); }
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  async function start() {
    if (!microphone || muted || !hasSong || status !== "idle") return;
    const id = ++request.current;
    setError(""); setStatus("choosing");
    microphone.monitor.gain.cancelScheduledValues(microphone.context.currentTime);
    microphone.monitor.gain.value = 0;
    latest.current.onCaptureChange(true);
    let capture: MediaStream | null = null;
    let mix: ReturnType<typeof liveMix> | null = null;
    let owned = false;
    try {
      const options: CaptureOptions = {
        video: { displaySurface: "browser" },
        audio: { suppressLocalAudioPlayback: false, restrictOwnAudio: false } as MediaTrackConstraints,
        preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "exclude", surfaceSwitching: "exclude",
      };
      capture = await navigator.mediaDevices.getDisplayMedia(options);
      if (!alive.current || request.current !== id || latest.current.microphone !== microphone) return;
      if (!capture.getAudioTracks().length) throw new Error("No song audio was shared. Choose this karaoke tab and enable Share tab audio.");
      const surface = capture.getVideoTracks()[0]?.getSettings().displaySurface;
      if (surface && surface !== "browser") throw new Error("Choose this karaoke browser tab, rather than a screen or window, to avoid capturing the audience output again.");
      const videoTrack = capture.getVideoTracks()[0] as MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } | null };
      if (captureHandle.current && videoTrack?.getCaptureHandle && videoTrack.getCaptureHandle()?.handle !== captureHandle.current) throw new Error("Choose the Solo studio tab that started sharing, not the audience output or another tab.");
      await microphone.context.resume();
      if (!alive.current || request.current !== id || latest.current.microphone !== microphone) return;
      mix = liveMix(microphone.context, new MediaStream(capture.getAudioTracks()), microphone.output.stream, delay);
      const captureStream = capture, graph = mix;
      let closed = false;
      session.current = {
        setDelay: graph.setDelay,
        close() {
          if (closed) return; closed = true;
          graph.close(); captureStream.getTracks().forEach(track => track.stop());
        },
      };
      window.encoreLiveMix = mix.stream;
      captureStream.getTracks().forEach(track => track.addEventListener("ended", stop, { once: true }));
      owned = true; setStatus("live");
    } catch (cause) {
      if (alive.current && request.current === id) setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Tab sharing was cancelled or denied. No audience output started." : cause instanceof Error ? cause.message : "This browser could not share tab audio.");
    } finally {
      if (!owned) {
        mix?.close(); capture?.getTracks().forEach(track => track.stop());
        if (alive.current) { setStatus("idle"); latest.current.onCaptureChange(false); }
      }
    }
  }
  function openOutput() {
    setError("");
    if (popup.current && !popup.current.closed) { popup.current.focus(); return; }
    popup.current = window.open("/audience", "encore-live-audience", "popup,width=620,height=680");
    if (!popup.current) setError("Allow popups for this site, then choose Open audience output again.");
  }

  return <section className="panel audience-panel" aria-labelledby="audience-heading">
    <div className="panel-heading"><h2 id="audience-heading">Live audience mix</h2><span className="tiny-label">DELAY COMPENSATION</span></div>
    <p>Follow the original song and lyrics in your headphones. A separate window sends your voice and a delayed copy of the song to audience speakers. Hear myself stays off.</p>
    <label className="field-label" htmlFor="audience-delay">Song delay for the audience: <strong>{delay} ms</strong></label>
    <input id="audience-delay" type="range" min={0} max={MAX_SONG_DELAY_MS} step={10} value={delay} onChange={event => setDelay(Number(event.target.value))}/>
    <p className="effects-note">If your voice reaches the audience late, increase song delay. If it arrives early, decrease it. The initial 150 ms is a starting guess; adjust while someone listens to the audience speakers.</p>
    <ol><li>Use your headphones as this device's default sound output. Connect and unmute your microphone.</li><li>Share <strong>this karaoke tab</strong> with <strong>Share tab audio</strong> enabled. Do not share the audience window.</li><li>Open audience output and choose a <strong>different speaker device</strong>, then enable its sound.</li></ol>
    {!supported && <p className="effects-note">This requires desktop tab-audio sharing and output-device selection, available in supported Chrome/Edge setups. Solo karaoke still works without it.</p>}
    {supported && (!microphone || muted || !hasSong) && <p className="effects-note">{!microphone ? "Connect your microphone to start." : muted ? "Unmute your microphone to start." : "Add a song to start."}</p>}
    <div className="pool-actions">
      {status === "idle" ? <button className="secondary-button" disabled={!supported || !microphone || muted || !hasSong} onClick={() => void start()}><Volume2 size={17}/>Share song tab</button> : <button className="danger-button" disabled={status === "choosing"} onClick={stop}>{status === "choosing" ? <LoaderCircle size={16} className="spin"/> : <Square size={16}/>} {status === "choosing" ? "Choose a tab in your browser" : "Stop audience mix"}</button>}
      {status === "live" && <button className="secondary-button" onClick={openOutput}><ExternalLink size={17}/>Open audience output</button>}
    </div>
    {status === "live" && <p className="effects-note" role="status">Live mix ready. Audience sound starts only after you select speakers and enable sound in the audience window.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="effects-note">Requires headphones and a separate speaker output on the same computer. Audio stays local; nothing is recorded or uploaded.</p>
  </section>;
}
