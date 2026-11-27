// These are preferences: devices that cannot provide them can still connect.
// TypeScript's DOM library omits the optional latency constraint on some versions.
type CaptureConstraints = MediaTrackConstraints & { latency: ConstrainDouble };

export function microphoneConstraints(device: string, monitoring: boolean): CaptureConstraints {
  return {
    ...(device ? { deviceId: { exact: device } } : {}),
    channelCount: { ideal: 1 },
    latency: { ideal: 0 },
    echoCancellation: !monitoring,
    noiseSuppression: !monitoring,
    autoGainControl: false,
  };
}
