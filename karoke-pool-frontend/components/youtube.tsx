"use client";
// @refresh reset
// Recreate the external player when development edits change its lifecycle.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import type { Song } from "@/lib/types";
import { correctPlayback, PLAYBACK_SYNC_INTERVAL_MS, type PlaybackSync, type SyncPlayer } from "@/lib/playback-sync";

// Fixed integer heights keep server and browser style serialization identical.
const SOUND_BAR_HEIGHTS = [12, 45, 19, 33, 34, 18, 46, 12, 45, 20, 32, 35, 17, 46, 12, 44, 21, 31, 36, 16, 46, 12, 43, 22, 30, 37, 15];

type Player = SyncPlayer & { loadVideoById: (v: string) => void; cueVideoById: (v: string) => void; setVolume: (n: number) => void; destroy: () => void };
declare global { interface Window { YT?: { Player: new (el: HTMLElement, opts: object) => Player }; onYouTubeIframeAPIReady?: () => void } }
let loader: Promise<void> | null = null;
function load() {
  if (window.YT?.Player) return Promise.resolve();
  if (!loader) loader = new Promise<void>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => { loader = null; script.remove(); reject(new Error("YouTube could not load. Check your connection and reload the page.")); };
    document.head.appendChild(script);
  });
  return loader;
}
export type PlayerHandle = { play: () => void; pause: () => void; seek: (position: number) => void; fullscreen: () => void };
type Props = { song: Song | null; autoPlay: boolean; volume: number; sync?: PlaybackSync; onChooseSong?: () => void; onPlayback: (playing: boolean) => void; onProgress: (position: number, duration: number) => void; onEnd: () => void; onError: (s: string) => void };
export const YouTube = forwardRef<PlayerHandle, Props>(function YouTube(props, ref) {
  const mount = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const latest = useRef(props); latest.current = props;
  const [ready, setReady] = useState(false);
  const hasSong = Boolean(props.song);
  const syncEnabled = Boolean(props.sync);
  const syncPlayback = () => {
    const p = player.current, sync = latest.current.sync;
    if (!p || !sync || !latest.current.song) return;
    correctPlayback(p, sync);
  };
  useImperativeHandle(ref, () => ({
    play: () => { if (player.current && ready) player.current.playVideo(); else latest.current.onError("The player is still loading. Try again in a moment."); },
    pause: () => player.current?.pauseVideo(), seek: n => player.current?.seekTo(n, true),
    fullscreen: () => {
      if (!container.current?.requestFullscreen) { latest.current.onError("Use the YouTube player's fullscreen control on this device."); return; }
      void container.current.requestFullscreen().catch(() => latest.current.onError("Fullscreen is unavailable in this browser. Try the YouTube player's fullscreen control."));
    }
  }), [ready]);
  useEffect(() => {
    if (!hasSong) {
      setReady(false);
      latest.current.onPlayback(false);
      latest.current.onProgress(0, 0);
      mount.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    void load().then(() => {
      if (cancelled || !mount.current) return;
      const element = document.createElement("div"); mount.current.replaceChildren(element);
      player.current = new window.YT!.Player(element, { width: "100%", height: "100%", playerVars: { playsinline: 1, origin: location.origin, rel: 0 }, events: {
        onReady: () => { if (!cancelled) { player.current?.setVolume(latest.current.volume); setReady(true); } },
        onStateChange: (e: { data: number }) => {
          if (cancelled) return;
          if (e.data === 1) latest.current.onPlayback(true);
          if ([0, 2, 5].includes(e.data)) latest.current.onPlayback(false);
          if (e.data === 0) latest.current.onEnd();
        },
        onError: () => { if (!cancelled) { latest.current.onPlayback(false); latest.current.onError("YouTube could not play this video. It may be restricted or unavailable; try another song."); } },
        onAutoplayBlocked: () => { if (!cancelled) latest.current.onError("Your browser paused autoplay. Press play inside the video to begin."); }
      }});
    }).catch((error: Error) => { if (!cancelled) latest.current.onError(error.message); });
    return () => { cancelled = true; player.current?.destroy(); player.current = null; mount.current?.replaceChildren(); };
  }, [hasSong]);
  useEffect(() => {
    if (!ready || !player.current) return;
    latest.current.onProgress(0, 0);
    if (!props.song) { player.current.pauseVideo(); return; }
    if (props.autoPlay) player.current.loadVideoById(props.song.video_id);
    else player.current.cueVideoById(props.song.video_id);
    if (latest.current.sync) syncPlayback();
  }, [ready, props.song, props.autoPlay]);
  useEffect(() => {
    if (!ready || !hasSong || !props.sync) return;
    syncPlayback();
  }, [ready, hasSong, props.sync?.playing, props.sync?.position, props.sync?.updatedAt, props.sync?.clockOffset]);
  useEffect(() => {
    if (!ready || !hasSong || !syncEnabled) return;
    // Keep the cadence stable when new room snapshots or clock estimates arrive.
    const timer = setInterval(syncPlayback, PLAYBACK_SYNC_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) syncPlayback(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ready, hasSong, syncEnabled]);
  useEffect(() => {
    if (!ready || !hasSong) return;
    const timer = setInterval(() => {
      const p = player.current;
      if (p) latest.current.onProgress(p.getCurrentTime() || 0, p.getDuration() || 0);
    }, 300);
    return () => clearInterval(timer);
  }, [ready, hasSong]);
  useEffect(() => { if (ready) player.current?.setVolume(props.volume); }, [props.volume, ready]);
  return <div className="video-stage" ref={container}>
    <div ref={mount} className={props.song ? "youtube-mount" : "youtube-mount hidden-player"} />
    {!props.song && <div className="stage-empty"><div className="stage-orbit"><Music2 size={42} strokeWidth={1.4} /></div><span className="eyebrow">THE STAGE IS YOURS</span><h2>Find your song.<br/>Make it your own.</h2><p>Bring a karaoke video from YouTube.<br/>We’ll take care of your sound.</p>{props.onChooseSong && <button className="stage-choose" onClick={props.onChooseSong}><Music2 size={17}/>Choose a song</button>}<div className="sound-bars" aria-hidden="true">{SOUND_BAR_HEIGHTS.map((height, i) => <i key={i} style={{ height: `${height}px` }} />)}</div></div>}
  </div>;
});
