import assert from "node:assert/strict";
import test from "node:test";
import { monitoringRoute } from "../lib/monitoring-route.ts";
import { audioLatency } from "../lib/audio-latency.ts";

test("fast monitoring uses only the direct path and can restore effects without parallel voice playback", () => {
  const node = () => ({ gain: { value: 0 }, targets: [], connect(target) { this.targets.push(target); return target; } });
  const gains = [], dry = node(), processed = node(), output = node(), clamp = node();
  const context = { createGain() { const g = node(); gains.push(g); return g; }, createWaveShaper() { return clamp; } };
  const switchRoute = monitoringRoute(context, dry, processed, output);
  const [direct, effects] = gains;
  assert.deepEqual(dry.targets, [clamp]);
  assert.deepEqual(clamp.targets, [direct]);
  assert.deepEqual(direct.targets, [output]);
  assert.deepEqual(processed.targets, [effects]);
  assert.deepEqual(effects.targets, [output]);
  assert.equal(clamp.oversample, "none");
  assert.deepEqual([...clamp.curve], [-1, 0, 1]);
  assert.deepEqual([direct.gain.value, effects.gain.value], [1, 0]);
  switchRoute(false);
  assert.deepEqual([direct.gain.value, effects.gain.value], [0, 1]);
  switchRoute(true);
  assert.deepEqual([direct.gain.value, effects.gain.value], [1, 0]);
});

test("delay reporting excludes compressor look-ahead only for the fast local path", () => {
  assert.equal(audioLatency(.01, .004, .08, true).totalMs, 94);
  assert.equal(audioLatency(.01, .004, .08, false).totalMs, 100);
  assert.equal(audioLatency(undefined, .004, .08, true).totalMs, null);
});
