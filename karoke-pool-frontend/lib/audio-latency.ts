export type AudioLatency = {
  inputMs: number | null;
  processingMs: number | null;
  outputMs: number | null;
  totalMs: number | null;
};

export function audioLatency(input: unknown, base: unknown, output: unknown, fastMonitoring = false): AudioLatency {
  const milliseconds = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value * 1000 : null;
  const inputMs = milliseconds(input);
  const baseMs = milliseconds(base);
  const outputMs = milliseconds(output);
  // Fast local monitoring bypasses the compressor's 6ms look-ahead.
  const processingMs = baseMs === null ? null : baseMs + (fastMonitoring ? 0 : 6);
  return {
    inputMs, processingMs, outputMs,
    totalMs: inputMs === null || processingMs === null || outputMs === null ? null : inputMs + processingMs + outputMs,
  };
}
