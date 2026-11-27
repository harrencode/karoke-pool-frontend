import assert from "node:assert/strict";
import test from "node:test";
import { audienceDevices } from "../lib/audience-devices.ts";

test("audience outputs exclude default headphones, aliases, and input devices", () => {
  const device = (deviceId, groupId, kind = "audiooutput") => ({ deviceId, groupId, kind });
  assert.deepEqual(audienceDevices([
    device("default", "headphones"), device("communications", "headphones"),
    device("bt-headphones", "headphones"), device("usb-speakers", "speakers"),
    device("microphone", "mic", "audioinput"), device("", ""),
  ]), [device("usb-speakers", "speakers")]);
});

test("without default group information only explicit output IDs are offered", () => {
  const speakers = { deviceId: "speakers", groupId: "", kind: "audiooutput" };
  assert.deepEqual(audienceDevices([{ deviceId: "default", groupId: "", kind: "audiooutput" }, speakers]), [speakers]);
});
