import assert from "node:assert/strict";
import test from "node:test";
import { microphoneConstraints } from "../lib/microphone-constraints.ts";

test("headphone monitoring requests low latency without speech processing", () => {
  const constraints = microphoneConstraints("usb-mic", true);
  assert.deepEqual(constraints.deviceId, { exact: "usb-mic" });
  assert.deepEqual(constraints.latency, { ideal: 0 });
  assert.deepEqual(constraints.channelCount, { ideal: 1 });
  assert.equal(constraints.echoCancellation, false);
  assert.equal(constraints.noiseSuppression, false);
  assert.equal(constraints.autoGainControl, false);
});

test("turning monitoring off restores speaker echo protection without changing the selected device", () => {
  const constraints = microphoneConstraints("", false);
  assert.equal("deviceId" in constraints, false);
  assert.equal(constraints.echoCancellation, true);
  assert.equal(constraints.noiseSuppression, true);
  assert.equal(constraints.autoGainControl, false);
  assert.equal("exact" in constraints.latency, false);
});
