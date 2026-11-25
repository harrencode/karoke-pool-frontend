"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Copy, Headphones, Lock, Maximize, Mic, MicOff, Music2, Pause, Play, Plus, RefreshCw, ShieldCheck, SkipForward, Trash2, Users, X } from "lucide-react";
import { checkPool, poolApiBase, poolRequest, PoolUnavailable, POOL_UNAVAILABLE, roomIdFromInput, validTicket } from "@/lib/pool-api";
import { canSing, type Mode, type PoolRoom, type PoolTicket } from "@/lib/pool-types";
import { usePoolRoom } from "@/lib/use-pool-room";
import { usePoolMic } from "@/lib/use-pool-mic";
import { timeLabel, videoId } from "@/lib/types";
import { YouTube, type PlayerHandle } from "./youtube";

function rememberTicket(ticket: PoolTicket) {
  try { sessionStorage.setItem(`encore.pool.${ticket.room_id}`, JSON.stringify(ticket)); } catch { /* A fresh join also works without storage. */ }
}
function forgetTicket(ticket: PoolTicket) { try { sessionStorage.removeItem(`encore.pool.${ticket.room_id}`); } catch { /* Optional persistence. */ } }

export default function Pool() {
  const [availability, setAvailability] = useState<"checking" | "ready" | "unavailable">("checking");
  const [base, setBase] = useState("");
  const [ticket, setTicket] = useState<PoolTicket | null>(null);
  const [name, setName] = useState("");
  const [invitation, setInvitation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const api = poolApiBase(); setBase(api); setAvailability("checking");
    void checkPool(api).then(() => {
      if (!active) return;
      setAvailability("ready");
      const roomId = roomIdFromInput(new URL(location.href).searchParams.get("room") || "");
      if (roomId) {
        setInvitation(roomId);
        try {
          const saved = JSON.parse(sessionStorage.getItem(`encore.pool.${roomId}`) || "null");
          if (validTicket(saved) && saved.room_id === roomId) setTicket(saved);
        } catch { /* Ask for a display name if a saved ticket is unavailable. */ }
      }
    }).catch(() => { if (active) setAvailability("unavailable"); });
    return () => { active = false; };
  }, [attempt]);

  async function enter(join: boolean) {
    if (!name.trim()) { setError("Enter your display name first."); return; }
    const roomId = join ? roomIdFromInput(invitation) : null;
    if (join && !roomId) { setError("Paste a valid invitation link or room code."); return; }
    setBusy(true); setError("");
    try {
      const next = await poolRequest<PoolTicket>(base, join ? `/api/rooms/${roomId}/join` : "/api/rooms", { name: name.trim() });
      if (!validTicket(next)) throw new PoolUnavailable();
      rememberTicket(next); setTicket(next);
      window.history.replaceState(null, "", `/pool?room=${next.room_id}`);
    } catch (e) {
      if (e instanceof PoolUnavailable) setAvailability("unavailable");
      else setError(e instanceof Error ? e.message : "Could not enter the room.");
    } finally { setBusy(false); }
  }
  function returnLobby() {
    if (ticket) forgetTicket(ticket);
    setTicket(null); setError(""); setInvitation(""); window.history.replaceState(null, "", "/pool"); setAttempt(n => n + 1);
  }

  return <div className="pool-shell">
    <header className="pool-header"><Link href="/" className="brand"><span className="brand-symbol"><AudioLines size={25}/></span>encore<span className="brand-dot">.</span></Link><nav aria-label="Karaoke modes"><Link href="/">Solo karaoke</Link><span aria-current="page"><Users size={17}/>Karaoke Pool</span></nav></header>
    {ticket ? <PoolSession key={ticket.token} base={base} ticket={ticket} returnLobby={returnLobby}/> : <main className="pool-lobby">
      <div className="eyebrow orange">GOOD MUSIC. YOUR FAVORITE PEOPLE.</div><h1>A little pool of <span>big voices.</span></h1><p className="pool-intro">Create a private karaoke party, share a link, and sing with up to four friends. No accounts needed.</p>
      {availability === "checking" ? <section className="pool-status panel" role="status"><RefreshCw className="spin"/><h2>Checking Karaoke Pool…</h2><p>Solo karaoke is always available.</p><Link href="/" className="secondary-button">Use Solo karaoke</Link></section> : availability === "unavailable" ? <section className="pool-status panel" role="status"><Users size={35}/><h2>Karaoke Pool party is not available right now.</h2><p>You can still use Solo karaoke, including your songs, microphone, and effects.</p><div className="pool-actions"><Link href="/" className="primary-button">Use Solo karaoke</Link><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={17}/>Try again</button></div></section> : <section className="pool-entry panel">
        <div className="pool-ready"><ShieldCheck size={17}/>Karaoke Pool is available</div>
        <form onSubmit={e => { e.preventDefault(); void enter(Boolean(invitation.trim())); }}>
          <label htmlFor="pool-name">Your display name</label><input id="pool-name" autoComplete="nickname" maxLength={32} required placeholder="What should we call you?" value={name} onChange={e => setName(e.target.value)}/>
          <label htmlFor="pool-invite">Invitation link or room code <span>(to join a room)</span></label><input id="pool-invite" maxLength={2048} placeholder="Paste your friend’s invitation here" value={invitation} onChange={e => setInvitation(e.target.value)}/>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="pool-actions"><button className="primary-button" disabled={busy} type="button" onClick={() => void enter(false)}><Plus size={18}/>{busy ? "Please wait…" : "Create a party"}</button><button className="secondary-button" disabled={busy || !invitation.trim()} type="submit"><Users size={18}/>Join a party</button></div>
        </form>
        <p className="pool-note"><Headphones size={17}/>Wired headphones work best. Allow your microphone only when you’re ready to sing.</p>
      </section>}
    </main>}
  </div>;
}

function Slider({ label, value, max = 100, change }: { label: string; value: number; max?: number; change: (n: number) => void }) {
  return <label className="pool-slider"><span>{label}<strong>{value}%</strong></span><input aria-label={label} type="range" min={0} max={max} value={value} onChange={e => change(Number(e.target.value))}/></label>;
}

function PoolSession({ base, ticket, returnLobby }: { base: string; ticket: PoolTicket; returnLobby: () => void }) {
  const [localError, setLocalError] = useState("");
  const mic = usePoolMic(setLocalError);
  const pool = usePoolRoom(base, ticket, mic.stream);
  const { room, status, send } = pool;
  const [music, setMusic] = useState(65);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"end" | string | null>(null);
  const player = useRef<PlayerHandle>(null);
  const active = status === "connected";
  const host = room?.host === ticket.member_id;
  const self = room?.members.find(m => m.id === ticket.member_id);
  const allowed = Boolean(active && room && canSing(room, ticket.member_id));
  const audible = Boolean(allowed && self && !self.muted && mic.stream);
  const lastSong = useRef<string | null>(null);
  // Reuse the same Song object between room snapshots so queue/mute updates do not reload YouTube.
  const songRef = useRef<PoolRoom["current"]>(null);
  if (room?.current?.id !== songRef.current?.id) songRef.current = room?.current || null;

  useEffect(() => { mic.setAllowed(audible); }, [audible, mic.stream]);
  useEffect(() => {
    if (active && !mic.stream && self && !self.muted) send({ type: "self_mute", value: true });
  }, [active, mic.stream, self?.muted]);
  useEffect(() => {
    if (!active) { mic.setAllowed(false); player.current?.pause(); }
  }, [active]);
  useEffect(() => {
    if (status === "ended") { mic.disconnect(); forgetTicket(ticket); }
  }, [status]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);

  function playback(playing: boolean) {
    if (host && active) send({ type: playing ? "play" : "pause", position });
  }
  function addSong(e: React.FormEvent) {
    e.preventDefault(); const id = videoId(url.trim());
    if (!id) { setLocalError("Paste a valid YouTube video link or video ID."); return; }
    if (send({ type: "queue_add", song: { video_id: id, title: title.trim() || `YouTube track · ${id}` } })) { setUrl(""); setTitle(""); }
  }
  async function copyInvitation() {
    const invite = `${location.origin}/pool?room=${ticket.room_id}`;
    try { await navigator.clipboard.writeText(invite); setNotice("Invitation copied. Share it with your friends."); }
    catch { setNotice(`Copy this invitation: ${invite}`); }
  }
  function leave() { mic.disconnect(); send({ type: "leave" }); returnLobby(); }
  const sync = room && active ? { playing: room.playing, position: room.position, updatedAt: room.updated_at, clockOffset: pool.clockOffset } : undefined;

  return <main className="pool-session">
    <div className="pool-session-heading"><div><div className="eyebrow orange">YOUR PRIVATE PARTY</div><h1>Karaoke <span>Pool.</span></h1><p>{room ? `${room.members.length} / 4 participants · ${host ? "You’re the host" : "Guest singer"}` : "Connecting to your room…"}</p></div><div className="pool-actions"><button className="secondary-button" onClick={copyInvitation}><Copy size={17}/>Invite friends</button><button className="secondary-button" onClick={leave}>Leave room</button></div></div>
    {!active && <div className="pool-banner" role="status"><strong>{status === "connecting" ? "Connecting to Karaoke Pool…" : status === "ended" ? pool.message : POOL_UNAVAILABLE}</strong><p>{status === "reconnecting" ? "Trying to reconnect. Your microphone is muted while disconnected." : "Solo karaoke is always available, with your own saved setlist."}</p><div className="pool-actions"><Link href="/" className="secondary-button" onClick={() => mic.disconnect()}>Use Solo karaoke</Link>{status === "ended" ? <button className="secondary-button" onClick={returnLobby}>Back to lobby</button> : <button className="secondary-button" onClick={pool.reconnect}>Retry connection</button>}</div></div>}
    {(localError || (active && pool.message)) && <div className="alert" role="alert"><span>{localError || pool.message}</span><button className="icon-btn" aria-label="Dismiss notification" onClick={() => { setLocalError(""); pool.setMessage(""); }}><X size={17}/></button></div>}
    <div className="pool-room-grid">
      <section className="pool-stage panel">
        <div className="pool-section-heading"><h2><Music2 size={19}/>Shared stage</h2><button className="icon-btn" aria-label="Fullscreen video" onClick={() => player.current?.fullscreen()}><Maximize size={18}/></button></div>
        <YouTube ref={player} song={songRef.current} autoPlay={false} volume={music} sync={sync} onPlayback={() => {}} onProgress={(p, d) => { setPosition(p); setDuration(d); }} onError={setLocalError} onEnd={() => {
          const key = room?.current?.id || null;
          if (host && active && key && lastSong.current !== key) { lastSong.current = key; send({ type: "next" }); }
        }}/>
        <div className="pool-player-controls"><h3>{room?.current?.title || "Add a karaoke track to begin"}</h3><div className="seek-row"><span>{timeLabel(position)}</span><input aria-label="Shared playback position" type="range" min={0} max={Math.max(duration, 1)} value={Math.min(position, duration || 0)} disabled={!active || !host || !room?.current || !duration} onChange={e => { const n = Number(e.target.value); send({ type: "seek", position: n }); }}/><span>{timeLabel(duration)}</span></div><div className="pool-actions"><button className="primary-button" disabled={!active || !host || !room?.current} onClick={() => playback(!room?.playing)}>{room?.playing ? <Pause size={18}/> : <Play size={18}/>} {room?.playing ? "Pause" : "Play"}</button><button className="secondary-button" disabled={!active || !host || !room?.queue.length} onClick={() => send({ type: "next" })}><SkipForward size={18}/>Next song</button><button className="secondary-button" disabled={!active || !host || !room?.current} onClick={() => send({ type: "queue_remove", target: room?.current?.id })}><Trash2 size={17}/>Remove current song</button><button className="secondary-button" onClick={() => { pool.enableAudio(); if (room?.playing && active) player.current?.play(); setNotice("Room audio enabled. If the video stays paused, press play inside YouTube."); }}><Headphones size={18}/>Enable room audio</button></div><p className="pool-note">{host ? "Use the shared controls to sync everyone. YouTube controls affect only your device." : "The host controls shared playback. Your music volume affects only your device."}</p><Slider label="Music volume" value={music} change={setMusic}/></div>
        <div className="pool-queue"><div className="pool-section-heading"><h2>Shared queue <span>{room?.queue.length || 0}</span></h2></div><form className="pool-song-form" onSubmit={addSong}><input aria-label="YouTube link" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a YouTube link" maxLength={2048} required disabled={!active}/><input aria-label="Song title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Song title (optional)" maxLength={150} disabled={!active}/><button className="secondary-button" disabled={!active}><Plus size={16}/>Add song</button></form>{!room?.queue.length ? <p className="pool-note">Everyone can add songs. The host can play or remove queued tracks.</p> : <ol className="song-list">{room.queue.map(song => <li key={song.id}><Music2 size={18}/><div className="song-details"><strong>{song.title}</strong><span>Added by {song.added_by}</span></div>{host && <><button className="icon-btn" aria-label={`Play ${song.title}`} disabled={!active} onClick={() => send({ type: "select", target: song.id })}><Play size={16}/></button><button className="icon-btn" aria-label={`Remove ${song.title}`} disabled={!active} onClick={() => send({ type: "queue_remove", target: song.id })}><Trash2 size={16}/></button></>}</li>)}</ol>}</div>
      </section>
      <aside className="pool-room-sidebar">
        <section className="panel pool-microphone"><h2><Mic size={19}/>Your microphone</h2><label htmlFor="pool-device">Input device</label><select id="pool-device" value={mic.device} disabled={mic.busy || Boolean(mic.stream)} onChange={e => mic.setDevice(e.target.value)}><option value="">System default microphone</option>{mic.devices.filter(d => d.deviceId !== "default").map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}</select><p className="pool-note">{mic.stream ? "Disconnect to change your input device." : "Connecting starts muted. Unmute when you’re ready."}</p>
          {!mic.stream ? <button className="primary-button" disabled={!active || mic.busy} onClick={() => { send({ type: "self_mute", value: true }); void mic.connect(); }}>{mic.busy ? "Connecting…" : "Connect microphone"}</button> : <><button className="primary-button" disabled={!active || (!allowed && Boolean(self?.muted))} onClick={() => send({ type: "self_mute", value: !self?.muted })}>{audible ? <MicOff size={17}/> : <Mic size={17}/>} {audible ? "Mute microphone" : "Unmute microphone"}</button><button className="disconnect" onClick={() => { mic.disconnect(); send({ type: "self_mute", value: true }); }}>Disconnect microphone</button></>}
          {!allowed && active && <p className="pool-note">{self?.forced_muted ? "The host has muted your microphone." : "You’re listening. The host can select you to sing."}</p>}
          <Slider label="Microphone volume" value={mic.gain} max={150} change={mic.setGain}/><label className="pool-check"><input type="checkbox" checked={mic.monitor} onChange={e => mic.setMonitor(e.target.checked)}/>Hear myself (use headphones)</label><Slider label="Echo" value={mic.echo} change={mic.setEcho}/><Slider label="Reverb" value={mic.reverb} change={mic.setReverb}/>
        </section>
        <section className="panel pool-members"><h2><Users size={19}/>Participants</h2>{room?.members.map(member => <div className="pool-member" key={member.id}><div className="pool-member-name"><span>{member.name} {member.id === ticket.member_id && "(you)"}</span>{member.id === room.host && <small>HOST</small>}</div><p>{!member.connected ? "Reconnecting…" : member.forced_muted ? "Muted by host" : member.muted ? "Microphone muted" : canSing(room, member.id) ? "Singing" : "Listening"}</p>{member.id !== ticket.member_id && <Slider label={`Volume for ${member.name}`} value={volumes[member.id] ?? 100} change={n => { setVolumes(v => ({ ...v, [member.id]: n })); pool.setVolume(member.id, n / 100); }}/>}<div className="pool-member-actions">{host && room.mode !== "group" && <label className="pool-check"><input type="checkbox" checked={room.singers.includes(member.id)} disabled={!active} onChange={e => {
          const ids = e.target.checked ? [...room.singers, member.id] : room.singers.filter(id => id !== member.id);
          if (ids.length < 1 || ids.length > (room.mode === "duet" ? 2 : 1)) { setLocalError("Keep one singer selected, or up to two for a duet. Deselect one before choosing another; switch to group mode to reset."); return; }
          send({ type: "singers", ids });
        }}/>Selected singer</label>}{host && member.id !== ticket.member_id && <><button disabled={!active} onClick={() => send({ type: "mute", target: member.id, value: !member.forced_muted })}>{member.forced_muted ? "Allow mic" : "Mute"}</button><button disabled={!active} onClick={() => setConfirm(member.id)}>Remove</button></>}</div></div>)}</section>
        {host && room && <section className="panel pool-host"><h2>Host controls</h2><label htmlFor="singing-mode">Singing mode</label><select id="singing-mode" value={room.mode} disabled={!active} onChange={e => send({ type: "mode", mode: e.target.value as Mode })}><option value="group">Group · everyone sings</option><option value="solo">Solo · one singer</option><option value="duet">Duet · two singers</option><option value="turn-based">Turn-based · rotate each song</option></select>{room.mode !== "group" && <><p className="pool-note">Choose who sings. Everyone else listens.</p><select aria-label="Lead singer" disabled={!active} value={room.singers[0] || ""} onChange={e => send({ type: "singers", ids: room.mode === "duet" ? [e.target.value, ...room.singers.slice(1).filter(id => id !== e.target.value)] : [e.target.value] })}>{room.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></>}<button className="secondary-button" disabled={!active} onClick={() => send({ type: "lock", value: !room.locked })}><Lock size={16}/>{room.locked ? "Unlock room" : "Lock room"}</button><button className="danger-button" disabled={!active} onClick={() => setConfirm("end")}>End party</button></section>}
        <button className="secondary-button" onClick={() => { mic.setAllowed(false); pool.reconnect(); }}><RefreshCw size={16}/>Reconnect room</button>
      </aside>
    </div>
    {notice && <div className="toast" role="status">{notice}</div>}
    {confirm && <div className="pool-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><div className="panel"><h2 id="confirm-title">{confirm === "end" ? "End the party for everyone?" : "Remove this participant?"}</h2><p>{confirm === "end" ? "Everyone will be disconnected. Solo karaoke stays available." : "Their microphone connection and room access will be closed."}</p><div className="pool-actions"><button className="secondary-button" autoFocus onClick={() => setConfirm(null)}>Cancel</button><button className="danger-button" onClick={() => { send(confirm === "end" ? { type: "end" } : { type: "remove", target: confirm }); setConfirm(null); }}>Confirm</button></div></div></div>}
  </main>;
}
