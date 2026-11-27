"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { audienceDevices } from "@/lib/audience-devices";

declare global { interface Window { encoreLiveMix?: MediaStream | null } }

export function AudienceOutput() {
  const audio = useRef<HTMLAudioElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [volume, setVolume] = useState(80);
  const [hasOpener, setHasOpener] = useState(true);
  const [canPickOutput, setCanPickOutput] = useState(false);

  useEffect(() => {
    const element = audio.current!;
    setSupported(typeof element.setSinkId === "function");
    setCanPickOutput(typeof (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: unknown })?.selectAudioOutput === "function");
    const enumerate = async () => {
      try { setDevices(audienceDevices(await navigator.mediaDevices.enumerateDevices())); }
      catch { setError("Speaker devices could not be listed. Check browser permissions."); }
    };
    void enumerate();
    const deviceChanged = () => { element.pause(); setPlaying(false); setDevice(""); void enumerate(); };
    navigator.mediaDevices?.addEventListener("devicechange", deviceChanged);
    const update = () => {
      let stream: MediaStream | null = null;
      try {
        setHasOpener(Boolean(window.opener && !window.opener.closed));
        if (window.opener && !window.opener.closed && window.opener.location.origin === location.origin) stream = window.opener.encoreLiveMix || null;
      } catch { /* Only a same-origin studio can supply audio. */ }
      if (element.srcObject !== stream) {
        element.pause(); element.srcObject = stream; setPlaying(false);
      }
      setReady(Boolean(stream?.active));
    };
    update(); const timer = setInterval(update, 500);
    return () => {
      clearInterval(timer); element.pause(); element.srcObject = null;
      navigator.mediaDevices?.removeEventListener("devicechange", deviceChanged);
    };
  }, []);
  useEffect(() => { if (audio.current) audio.current.volume = volume / 100; }, [volume]);

  async function enable() {
    if (!audio.current || !ready || !device || busy) return;
    setError(""); setBusy(true);
    try {
      await audio.current.setSinkId(device);
      await audio.current.play(); setPlaying(true);
    } catch { setPlaying(false); setError("Could not play through those speakers. Check the output selection and browser speaker permissions, then try again."); }
    finally { setBusy(false); }
  }
  async function pickOutput() {
    try {
      const media = navigator.mediaDevices as MediaDevices & { selectAudioOutput: () => Promise<MediaDeviceInfo> };
      const selected = await media.selectAudioOutput();
      const outputs = audienceDevices(await media.enumerateDevices());
      setDevices(outputs);
      if (!outputs.some(output => output.deviceId === selected.deviceId)) throw new Error("Choose speakers different from the default headphones.");
      audio.current?.pause(); setPlaying(false); setDevice(selected.deviceId); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Speaker selection was cancelled."); }
  }

  return <main className="audience-output">
    <div className="eyebrow orange">LIVE KARAOKE OUTPUT</div><h1>For your <span>audience.</span></h1>
    <section className="panel audience-panel">
      <h2>{playing && ready ? "Audience sound is live" : "Choose your audience speakers"}</h2>
      <p>The singer keeps the original song in their headphones. These speakers receive the delayed song and microphone together.</p>
      {!hasOpener && <p className="form-error" role="status">Open this window using Open audience output in the Solo studio.</p>}
      {hasOpener && !ready && <p className="effects-note" role="status">Waiting for the studio. Start Share song tab there first.</p>}
      {!supported && <p className="form-error">Speaker selection is unavailable in this browser. Use a supported desktop Chrome or Edge browser.</p>}
      <label className="field-label" htmlFor="audience-speakers">Separate audience output device</label>
      <select id="audience-speakers" value={device} disabled={!supported || busy} onChange={event => { audio.current?.pause(); setPlaying(false); setDevice(event.target.value); }}>
        <option value="">Choose speakers, not the singer's headphones</option>
        {devices.map((output, index) => <option key={output.deviceId} value={output.deviceId}>{output.label || `Output ${index + 1}`}</option>)}
      </select>
      {canPickOutput && <button className="secondary-button" onClick={() => void pickOutput()}>Choose speakers with browser</button>}
      {supported && !devices.length && <p className="effects-note">No separate output is available yet. Connect speakers or an audio interface in addition to your default headphones, then refresh this window if needed.</p>}
      <p className="effects-note">Choose a device different from the computer's default headphone output. Keep speaker sound away from the microphone to avoid feedback. Never share this window as the song source.</p>
      <label className="field-label" htmlFor="audience-volume">Audience volume: {volume}%</label>
      <input id="audience-volume" type="range" min={0} max={100} value={volume} onChange={event => setVolume(Number(event.target.value))}/>
      <div className="pool-actions"><button className="primary-button" disabled={!supported || !ready || !device || busy} onClick={() => void enable()}><Volume2 size={18}/>{busy ? "Connecting..." : "Enable audience sound"}</button><button className="secondary-button" disabled={!playing} onClick={() => { audio.current?.pause(); setPlaying(false); }}><VolumeX size={18}/>Mute audience</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="effects-note">Adjust Song delay in the studio while someone listens here. Audio stays on this computer; nothing is recorded.</p>
    </section>
    <audio ref={audio} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}/>
  </main>;
}
