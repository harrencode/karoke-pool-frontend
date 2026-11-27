"use client";

import { useEffect, useState } from "react";
import type { Microphone } from "@/lib/audio";
import type { AudioLatency } from "@/lib/audio-latency";

export function MicrophoneDelay({ microphone }: { microphone: Microphone }) {
  const [latency, setLatency] = useState<AudioLatency | null>(null);
  useEffect(() => {
    const update = () => setLatency(microphone.latency());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [microphone]);
  const display = (value: number | null | undefined) => value == null ? "Not reported" : `${Math.round(value)} ms`;
  return <details className="effects-details">
    <summary>Microphone delay: {latency?.totalMs != null ? `about ${Math.round(latency.totalMs)} ms` : "see reported values"}</summary>
    <dl className="latency-values">
      <div><dt>Microphone input</dt><dd>{display(latency?.inputMs)}</dd></div>
      <div><dt>Audio processing</dt><dd>{display(latency?.processingMs)}</dd></div>
      <div><dt>Sound output</dt><dd>{display(latency?.outputMs)}</dd></div>
    </dl>
    <p className="effects-note">These are browser estimates for your local voice, not a measured delay against the song. Bluetooth can add delay the browser does not report. Compare with wired headphones and set Echo/Reverb to 0. Pool network delay and effect tails are excluded.</p>
  </details>;
}
