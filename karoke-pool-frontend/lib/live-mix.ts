export const MAX_SONG_DELAY_MS = 2000;

export function songDelaySeconds(milliseconds: number) {
  return Math.max(0, Math.min(MAX_SONG_DELAY_MS, Number.isFinite(milliseconds) ? milliseconds : 0)) / 1000;
}

// This bus goes only to the separate audience window, never to the singer's headphones.
export function liveMix(context: AudioContext, music: MediaStream, microphone: MediaStream, delayMs: number) {
  const musicSource = context.createMediaStreamSource(music);
  const voiceSource = context.createMediaStreamSource(microphone);
  const delay = context.createDelay(MAX_SONG_DELAY_MS / 1000);
  const bus = context.createGain();
  const limiter = context.createDynamicsCompressor();
  const output = context.createMediaStreamDestination();
  delay.delayTime.value = songDelaySeconds(delayMs);
  musicSource.connect(delay).connect(bus);
  voiceSource.connect(bus);
  bus.connect(limiter).connect(output);
  let closed = false;
  return {
    stream: output.stream,
    setDelay(milliseconds: number) {
      delay.delayTime.setTargetAtTime(songDelaySeconds(milliseconds), context.currentTime, 0.02);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const node of [musicSource, voiceSource, delay, bus, limiter, output]) node.disconnect();
      output.stream.getTracks().forEach(track => track.stop());
      // The caller owns capture; the studio owns its microphone and context.
    },
  };
}
