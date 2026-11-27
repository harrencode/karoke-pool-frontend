export function monitoringRoute(context: AudioContext, dry: AudioNode, processed: AudioNode, output: GainNode) {
  const direct = context.createGain();
  const effects = context.createGain();
  // An instantaneous clamp prevents boosted input from exceeding full scale.
  // No oversampling or compressor look-ahead is used in the direct path.
  const clamp = context.createWaveShaper();
  clamp.curve = new Float32Array([-1, 0, 1]);
  clamp.oversample = "none";
  dry.connect(clamp).connect(direct).connect(output);
  processed.connect(effects).connect(output);
  direct.gain.value = 1;
  effects.gain.value = 0;
  return (fast: boolean) => {
    direct.gain.value = fast ? 1 : 0;
    effects.gain.value = fast ? 0 : 1;
  };
}
