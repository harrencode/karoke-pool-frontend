import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctPlayback } from '../lib/playback-sync.ts';

function player(position, state = 1, duration = 240) {
  const calls = [];
  return { calls, getCurrentTime: () => position, getDuration: () => duration, getPlayerState: () => state,
    seekTo: (n, ahead) => calls.push(['seek', n, ahead]), playVideo: () => calls.push(['play']), pauseVideo: () => calls.push(['pause']) };
}
const playing = { playing: true, position: 30, updatedAt: 100, clockOffset: 0 };

test('corrects players ahead or behind using elapsed time and server clock offset', () => {
  for (const position of [20, 50]) {
    const p = player(position);
    correctPlayback(p, { ...playing, clockOffset: 2000 }, 108000);
    assert.deepEqual(p.calls, [['seek', 40, true]]);
  }
});
test('leaves playback alone when drift stays within half a second', () => {
  for (const position of [39.5, 40, 40.5]) {
    const p = player(position);
    correctPlayback(p, playing, 110000);
    assert.deepEqual(p.calls, []);
  }
});
test('corrects shared paused position without adding elapsed time', () => {
  const p = player(40);
  correctPlayback(p, { ...playing, playing: false }, 110000);
  assert.deepEqual(p.calls, [['seek', 30, true], ['pause']]);
});
test('restores an incorrectly paused player and does not restart buffering', () => {
  const paused = player(40, 2);
  correctPlayback(paused, playing, 110000);
  assert.deepEqual(paused.calls, [['play']]);
  const buffering = player(20, 3);
  correctPlayback(buffering, playing, 110000);
  assert.deepEqual(buffering.calls, []);
  const resumed = player(20, 1);
  correctPlayback(resumed, playing, 110000);
  assert.deepEqual(resumed.calls, [['seek', 40, true]]);
});
test('does not repeatedly seek or restart a completed song', () => {
  const p = player(240, 0);
  correctPlayback(p, playing, 315000);
  assert.deepEqual(p.calls, []);
});
test('waits for video duration before seeking and rejects invalid player readings', () => {
  const loading = player(0, 5, 0);
  correctPlayback(loading, playing, 110000);
  assert.deepEqual(loading.calls, [['play']]);
  const invalid = player(NaN);
  correctPlayback(invalid, playing, 110000);
  assert.deepEqual(invalid.calls, []);
});
