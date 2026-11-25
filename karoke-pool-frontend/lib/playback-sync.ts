export type PlaybackSync = { playing: boolean; position: number; updatedAt: number; clockOffset: number };
export type SyncPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
};

export const MAX_PLAYBACK_DRIFT_SECONDS = 0.5;
export const PLAYBACK_SYNC_INTERVAL_MS = 1000;

export function correctPlayback(player: SyncPlayer, sync: PlaybackSync, now = Date.now()) {
  const elapsed = sync.playing ? Math.max(0, (now + sync.clockOffset) / 1000 - sync.updatedAt) : 0;
  const target = Math.max(0, sync.position + elapsed);
  const position = player.getCurrentTime();
  const duration = player.getDuration();
  const state = player.getPlayerState();
  if (![target, position, duration].every(Number.isFinite)) return;

  // Wait for metadata before seeking, and leave natural song completion alone.
  const nearEnd = duration > 0 && target >= duration - MAX_PLAYBACK_DRIFT_SECONDS;
  if (state !== 3 && duration > 0 && !nearEnd && Math.abs(position - target) > MAX_PLAYBACK_DRIFT_SECONDS) {
    player.seekTo(target, true);
  }
  if (sync.playing) {
    // 1 = playing, 3 = buffering, 0 = ended. Avoid repeated play commands.
    if (state !== 1 && state !== 3 && !(state === 0 && nearEnd)) player.playVideo();
  } else if (state !== 2) {
    player.pauseVideo();
  }
}
