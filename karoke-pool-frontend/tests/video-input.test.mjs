import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoId, validSong, timeLabel } from '../lib/types.ts';

const id = 'aB9_dE-fGh1';
test('accepts the supported YouTube video formats', () => {
  const inputs = [id, `https://www.youtube.com/watch?v=${id}&list=example`, `https://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=share`, `https://youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`, `https://youtube-nocookie.com/embed/${id}`, `https://www.youtube.com/live/${id}`];
  for (const value of inputs) assert.equal(videoId(value), id, value);
});
test('rejects lookalike domains, unsafe protocols and non-video URLs', () => {
  const inputs = [`https://youtube.com.evil.test/watch?v=${id}`, `https://evil.test/youtube.com?v=${id}`, `https://youtu.be.evil.test/${id}`, `javascript:alert(1)`, `ftp://youtube.com/watch?v=${id}`, `https://youtube.com/playlist?list=example`, `https://youtube.com/watch?v=short`, '', 'hello world', `https://youtube.com/watch?v=${id}extra`];
  for (const value of inputs) assert.equal(videoId(value), null, value);
});
test('corrupted browser records cannot become player inputs', () => {
  const song = { id: 'track-1', video_id: id, title: 'My favorite karaoke' };
  assert.equal(validSong(song), true);
  for (const value of [null, [], {}, {...song, video_id: `https://youtu.be/${id}`}, {...song, video_id: '<script>'}, {...song, title: null}, {...song, title: ' '}, {...song, title: 'a'.repeat(151)}, {...song, id: ''}]) assert.equal(validSong(value), false);
});
test('unavailable or invalid player times render safely', () => {
  assert.equal(timeLabel(0), '0:00');
  assert.equal(timeLabel(125.8), '2:05');
  assert.equal(timeLabel(NaN), '0:00');
  assert.equal(timeLabel(Infinity), '0:00');
  assert.equal(timeLabel(-3), '0:00');
});
