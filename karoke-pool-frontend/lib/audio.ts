export class Microphone {
  context: AudioContext;
  input: MediaStream;
  output: MediaStreamAudioDestinationNode;
  gain: GainNode;
  monitor: GainNode;
  echo: GainNode;
  reverb: GainNode;
  analyser: AnalyserNode;
  constructor(input: MediaStream) {
    this.input = input;
    this.context = new AudioContext({ latencyHint: "interactive" });
    const c = this.context;
    const source = c.createMediaStreamSource(input);
    this.gain = c.createGain();
    this.monitor = c.createGain();
    this.monitor.gain.value = 0;
    this.output = c.createMediaStreamDestination();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.gain);
    const mix = c.createGain();
    this.gain.connect(mix);
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.22;
    this.echo = c.createGain();
    this.echo.gain.value = 0;
    this.gain.connect(delay).connect(this.echo).connect(mix);
    const convolution = c.createConvolver();
    const impulse = c.createBuffer(2, c.sampleRate * 1.4, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const samples = impulse.getChannelData(ch);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 3);
    }
    convolution.buffer = impulse;
    this.reverb = c.createGain();
    this.reverb.gain.value = 0;
    this.gain.connect(convolution).connect(this.reverb).connect(mix);
    const limiter = c.createDynamicsCompressor();
    mix.connect(limiter);
    limiter.connect(this.output);
    limiter.connect(this.analyser);
    limiter.connect(this.monitor).connect(c.destination);
  }
  mute(value: boolean) {
    this.input.getAudioTracks().forEach(t => { t.enabled = !value; });
    this.output.stream.getAudioTracks().forEach(t => { t.enabled = !value; });
  }
  close() {
    this.input.getTracks().forEach(t => t.stop());
    this.output.stream.getTracks().forEach(t => t.stop());
    void this.context.close();
  }
}
