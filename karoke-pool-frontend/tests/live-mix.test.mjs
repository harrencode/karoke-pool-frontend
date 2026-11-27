import assert from "node:assert/strict";
import test from "node:test";
import { liveMix, songDelaySeconds } from "../lib/live-mix.ts";

test("only backing music is delayed and the combined bus never feeds singer headphones", () => {
  const node = name => ({ name, targets: [], disconnects: 0, connect(target) { this.targets.push(target); return target; }, disconnect() { this.disconnects++; } });
  let outputStops = 0, micStops = 0, captureStops = 0, contextCloses = 0;
  const music = { getTracks: () => [{ stop() { captureStops++; } }] };
  const mic = { getTracks: () => [{ stop() { micStops++; } }] };
  const sources = [], delay = { ...node("delay"), delayTime: { value: 0, setTargetAtTime(value) { this.value = value; } } }, bus = node("bus"), limiter = node("limiter"), output = node("output"), headphones = node("headphones");
  output.stream = { getTracks: () => [{ stop() { outputStops++; } }] };
  const context = {
    destination: headphones,
    createMediaStreamSource(stream) { const source = { ...node("source"), stream }; sources.push(source); return source; },
    createDelay(max) { assert.equal(max, 2); return delay; },
    createGain: () => bus,
    createDynamicsCompressor: () => limiter,
    createMediaStreamDestination: () => output,
    close() { contextCloses++; },
  };
  const mix = liveMix(context, music, mic, 240);
  assert.equal(delay.delayTime.value, .24);
  assert.equal(sources[0].stream, music);
  assert.equal(sources[1].stream, mic);
  assert.deepEqual(sources[0].targets, [delay]);
  assert.deepEqual(delay.targets, [bus]);
  assert.deepEqual(sources[1].targets, [bus]);
  assert.deepEqual(bus.targets, [limiter]);
  assert.deepEqual(limiter.targets, [output]);
  assert.equal(mix.stream, output.stream);
  for (const n of [...sources, delay, bus, limiter, output]) assert.ok(!n.targets.includes(headphones));
  mix.setDelay(480); assert.equal(delay.delayTime.value, .48); mix.setDelay(-50); assert.equal(delay.delayTime.value, 0);
  mix.close(); mix.close();
  for (const n of [...sources, delay, bus, limiter, output]) assert.equal(n.disconnects, 1);
  assert.equal(outputStops, 1);
  assert.equal(micStops, 0);
  assert.equal(captureStops, 0);
  assert.equal(contextCloses, 0);
});

test("compensation is bounded to a non-negative two-second delay", () => {
  assert.equal(songDelaySeconds(0), 0);
  assert.equal(songDelaySeconds(-100), 0);
  assert.equal(songDelaySeconds(500), .5);
  assert.equal(songDelaySeconds(9000), 2);
  assert.equal(songDelaySeconds(NaN), 0);
  assert.equal(songDelaySeconds(Infinity), 0);
});
