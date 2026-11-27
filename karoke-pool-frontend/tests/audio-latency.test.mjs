import assert from "node:assert/strict";
import test from "node:test";
import { audioLatency } from "../lib/audio-latency.ts";

test("converts reported stages to milliseconds and includes compressor look-ahead once", () => {
  assert.deepEqual(audioLatency(0.01, 0.004, 0.08), {
    inputMs: 10, processingMs: 10, outputMs: 80, totalMs: 100,
  });
});

test("does not present incomplete or invalid reports as a complete measured delay", () => {
  for (const missing of [undefined, null, NaN, Infinity, -1]) {
    assert.equal(audioLatency(missing, 0, 0.08).totalMs, null);
    assert.equal(audioLatency(0.01, missing, 0.08).totalMs, null);
    assert.equal(audioLatency(0.01, 0, missing).totalMs, null);
  }
  assert.equal(audioLatency(undefined, 0, 0.08).outputMs, 80);
  assert.equal(audioLatency(0, 0, 0).totalMs, 6);
});
