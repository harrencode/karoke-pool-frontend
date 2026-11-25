"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AudioLines, Check, ChevronDown, CircleHelp, Clock3, ExternalLink, Headphones, History, Link2, ListMusic, LoaderCircle, Maximize, Mic, MicOff, Music2, Pause, Play, Plus, Radio, RotateCcw, Search, ShieldCheck, SkipForward, SlidersHorizontal, Sparkles, Trash2, Users, Volume2, X } from "lucide-react";
import { Microphone } from "@/lib/audio";
import { Song, timeLabel, validSong, videoId } from "@/lib/types";
import { PlayerHandle, YouTube } from "./youtube";

const STORAGE = "encore.solo.v1";
type Settings = { music: number; mic: number; echo: number; reverb: number };
const defaults: Settings = { music: 65, mic: 100, echo: 0, reverb: 0 };

function Range({ label, value, max = 100, onChange, suffix = "%" }: { label: string; value: number; max?: number; onChange: (n: number) => void; suffix?: string }) {
  return <div className="range-control"><div><label>{label}</label><span>{value}{suffix}</span></div><input aria-label={label} type="range" min={0} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ "--fill": `${value / max * 100}%` } as React.CSSProperties}/></div>;
}

export default function Karaoke() {
  const [current, setCurrent] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [history, setHistory] = useState<Song[]>([]);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [dialog, setDialog] = useState<"song" | "help" | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [songError, setSongError] = useState("");
  const [notice, setNotice] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [level, setLevel] = useState(0);
  const mic = useRef<Microphone | null>(null);
  const player = useRef<PlayerHandle>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const modal = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (stored) {
        if (validSong(stored.current)) setCurrent(stored.current);
        if (Array.isArray(stored.queue)) setQueue(stored.queue.filter(validSong).slice(0, 50));
        if (Array.isArray(stored.history)) setHistory(stored.history.filter(validSong).slice(0, 30));
        if (stored.settings) setSettings(Object.fromEntries(Object.entries(defaults).map(([k, fallback]) => {
          const value = stored.settings[k]; return [k, typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(k === "mic" ? 150 : 100, value)) : fallback];
        })) as Settings);
      }
    } catch { /* Storage can be unavailable in private browser contexts. */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ current, queue, history, settings })); } catch { /* The studio also works without persistence. */ }
  }, [current, queue, history, settings, hydrated]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current++; mic.current?.close(); mic.current = null; };
  }, []);
  useEffect(() => {
    if (dialog && modal.current && !modal.current.open) modal.current.showModal();
    if (!dialog && modal.current?.open) modal.current.close();
  }, [dialog]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer);
  }, [notice]);

  const listDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices?.enumerateDevices();
      if (mounted.current) setDevices((all || []).filter(d => d.kind === "audioinput"));
    } catch { /* Labels become available after microphone permission. */ }
  }, []);
  useEffect(() => {
    void listDevices();
    navigator.mediaDevices?.addEventListener("devicechange", listDevices);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", listDevices);
  }, [listDevices]);

  async function connectMic(selected = device) {
    if (!window.isSecureContext) { setError("Microphone access is blocked on this HTTP address. On this computer, open http://localhost:3000. On a TV or phone, use a trusted HTTPS address."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError("Microphone access needs HTTPS or localhost and a supported browser."); return; }
    const id = ++requestId.current;
    setBusy(true); setError("");
    let input: MediaStream | null = null;
    let graph: Microphone | null = null;
    try {
      input = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: selected ? { exact: selected } : undefined,
        echoCancellation: true, noiseSuppression: true, autoGainControl: false
      }});
      if (!mounted.current || id !== requestId.current) { input.getTracks().forEach(t => t.stop()); return; }
      graph = new Microphone(input);
      await graph.context.resume();
      if (!mounted.current || id !== requestId.current) { graph.close(); return; }
      graph.gain.gain.value = settings.mic / 100;
      graph.echo.gain.value = settings.echo / 100 * 0.65;
      graph.reverb.gain.value = settings.reverb / 100 * 0.7;
      graph.monitor.gain.value = monitor ? 1 : 0;
      mic.current?.close();
      mic.current = graph;
      setConnected(true); setMuted(false);
      input.getAudioTracks()[0].onended = () => {
        if (mic.current === graph) {
          graph?.close(); mic.current = null; setConnected(false); setLevel(0);
          setError("Your microphone disconnected. Select an available input and connect again.");
        }
      };
      await listDevices();
    } catch (e) {
      graph?.close(); input?.getTracks().forEach(t => t.stop());
      if (!mounted.current || id !== requestId.current) return;
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotAllowedError" ? "Microphone permission was denied. Allow access in your browser’s site settings, then try again." : name === "NotFoundError" || name === "OverconstrainedError" ? "This microphone is unavailable. Select another input or connect a microphone." : "Could not open your microphone. Close other apps using it and try again.");
    } finally { if (mounted.current && id === requestId.current) setBusy(false); }
  }
  function disconnectMic() {
    requestId.current++; mic.current?.close(); mic.current = null;
    setConnected(false); setMuted(false); setBusy(false); setLevel(0);
  }
  useEffect(() => {
    const graph = mic.current; if (!graph) return;
    graph.gain.gain.setTargetAtTime(settings.mic / 100, graph.context.currentTime, 0.02);
    graph.echo.gain.setTargetAtTime(settings.echo / 100 * 0.65, graph.context.currentTime, 0.02);
    graph.reverb.gain.setTargetAtTime(settings.reverb / 100 * 0.7, graph.context.currentTime, 0.02);
    graph.monitor.gain.setTargetAtTime(monitor && !muted ? 1 : 0, graph.context.currentTime, 0.02);
    graph.mute(muted);
  }, [settings, monitor, muted, connected]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      const graph = mic.current; if (!graph) return;
      const data = new Uint8Array(graph.analyser.fftSize);
      graph.analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / data.length);
      setLevel(muted ? 0 : Math.min(100, rms * 350));
    }, 80);
    return () => clearInterval(timer);
  }, [connected, muted]);

  function update(key: keyof Settings, value: number) { setSettings(s => ({ ...s, [key]: value })); }
  function remember(song: Song) { setHistory(h => [song, ...h.filter(s => s.video_id !== song.video_id)].slice(0, 30)); }
  function select(song: Song, play = false) {
    setCurrent({ ...song, id: crypto.randomUUID() }); setAutoPlay(play); setPlaying(false); setPosition(0); setDuration(0); remember(song);
  }
  function next(play = playing) {
    if (!queue.length) { player.current?.pause(); setPlaying(false); return; }
    select(queue[0], play); setQueue(q => q.slice(1));
  }
  function clearCurrent() {
    player.current?.pause();
    setCurrent(null); setPlaying(false); setAutoPlay(false); setPosition(0); setDuration(0);
  }
  function removeSong(song: Song) {
    if (tab === "queue") setQueue(q => q.filter(s => s.id !== song.id));
    else setHistory(h => h.filter(s => s.id !== song.id));
    // Recent entries keep the original ID while the stage uses a new playback ID.
    if (current && (current.id === song.id || (tab === "history" && current.video_id === song.video_id))) clearCurrent();
  }
  function addSong(e: React.FormEvent) {
    e.preventDefault();
    const id = videoId(url.trim());
    if (!id) { setSongError("Paste a valid YouTube video link or an 11-character video ID."); return; }
    if (queue.length >= 50) { setSongError("Your queue is full. Remove a song before adding another."); return; }
    const song = { id: crypto.randomUUID(), video_id: id, title: title.trim() || `YouTube track · ${id}` };
    if (!current) select(song); else setQueue(q => [...q, song]);
    setUrl(""); setTitle(""); setDialog(null); setSongError(""); setNotice(current ? "Song added to your queue" : "Your song is ready. Press play to begin.");
  }
  function openSong() { setSongError(""); setDialog("song"); }
  function goTo(section: string) { document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function youtubeSearch(query = search) { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent((query.trim() || "popular songs") + " karaoke")}`, "_blank", "noopener,noreferrer"); }
  const progress = useCallback((p: number, d: number) => { setPosition(p); setDuration(d); }, []);
  const listed = tab === "queue" ? queue : history;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Encore home"><span className="brand-symbol"><AudioLines size={25}/></span>encore<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR BACKSTAGE</div>
      <nav aria-label="Main navigation">
        <button aria-label="Solo studio" className="nav-item active" onClick={() => { setTab("queue"); document.getElementById("studio")?.scrollIntoView({behavior:"smooth"}); }}><Radio size={19}/>Solo studio<span className="nav-pill">SOLO</span></button>
        <Link className="nav-item" href="/pool" aria-label="Karaoke Pool"><Users size={19}/>Karaoke Pool</Link>
        <button aria-label="Recently played" className="nav-item" onClick={() => { setTab("history"); document.getElementById("setlist")?.scrollIntoView({behavior:"smooth"}); }}><History size={19}/>Recently played<span className="nav-count">{history.length}</span></button>
      </nav>
      <div className="sidebar-card"><div className="small-orbit"><Headphones size={22}/></div><h3>Your voice.<br/>Your moment.</h3><p>No audience required.<br/>Just press play and let go.</p><span>SOLO KARAOKE</span></div>
      <div className="sidebar-bottom"><button aria-label="Help and sound setup" className="nav-item" onClick={() => setDialog("help")}><CircleHelp size={19}/>A little help</button><div className="guest"><div className="avatar">Y</div><div><strong>Your personal studio</strong><span>No account needed</span></div><ShieldCheck size={17}/></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Your workspace <span>/</span> <strong>Solo studio</strong></div><Link className="pool-mode-link" href="/pool"><Users size={16}/>Karaoke Pool</Link><span className="private-badge"><ShieldCheck size={14}/>Just you & the music</span><button className="icon-btn help-top" aria-label="Help" onClick={() => setDialog("help")}><CircleHelp size={20}/></button></header>
      <main id="studio">
        <div className="page-heading">
          <div><div className="eyebrow orange">YOUR PERSONAL KARAOKE STUDIO</div><h1>Your voice. <span>Your stage.</span></h1><p>A favorite song, a little courage, and a moment for yourself.</p></div>
          <button className="primary-button heading-action" onClick={openSong}><Plus size={19}/>Add a song</button>
        </div>
        <div className="session-overview" aria-label="Studio status">
          <div><Music2 size={18}/><span>Song<strong>{current ? "Ready to play" : "Choose your first track"}</strong></span></div>
          <button onClick={() => goTo("sound-controls")}><Mic size={18}/><span>Microphone<strong>{busy ? "Connecting?" : connected ? muted ? "Muted" : "Connected" : "Not connected"}</strong></span></button>
          <div><Headphones size={18}/><span>Voice monitoring<strong>{monitor && connected && !muted ? "On ? use headphones" : "Off"}</strong></span></div>
        </div>
        {error && <div role="alert" className="alert"><CircleHelp size={18}/><span>{error}</span><button className="icon-btn" aria-label="Dismiss error" onClick={() => setError("")}><X size={17}/></button></div>}

        <div className="studio-grid">
          <section className="performance" aria-label="Karaoke player">
            <div className="section-top"><div className="section-label"><Radio size={16}/><span>YOUR STAGE</span></div><div className="player-tools"><span className="subtle">Powered by YouTube</span><button className="icon-btn" aria-label="Fullscreen video" onClick={() => player.current?.fullscreen()}><Maximize size={15}/></button></div></div>
            <YouTube ref={player} onChooseSong={openSong} song={current} autoPlay={autoPlay} volume={settings.music} onPlayback={setPlaying} onProgress={progress} onEnd={() => next(true)} onError={setError}/>
            <div className="transport">
              <div className="now-playing"><div className="track-icon"><Music2 size={21}/></div><div><span className="eyebrow">{current ? "NOW ON STAGE" : "SOUND CHECK"}</span><h3 title={current?.title}>{current?.title || "Your next favorite performance"}</h3><p>{current ? "YouTube karaoke · Solo session" : "Add a song to get the night started"}</p></div>{current && <button className="icon-btn" title="Remove current song" aria-label="Remove current song" onClick={clearCurrent}><Trash2 size={18}/></button>}<button className="icon-btn" title="Add a song" aria-label="Add a song" onClick={openSong}><Plus size={21}/></button></div>
              <div className="seek-row"><span>{timeLabel(position)}</span><input aria-label="Playback position" type="range" min={0} max={Math.max(duration, 1)} step={0.1} value={Math.min(position, duration || 0)} disabled={!current || !duration} onChange={e => { const n = Number(e.target.value); setPosition(n); player.current?.seek(n); }}/><span>{timeLabel(duration)}</span></div>
              <div className="playback-controls"><div className="music-volume"><Volume2 size={18}/><input aria-label="Music volume" type="range" min={0} max={100} value={settings.music} onChange={e => update("music", Number(e.target.value))}/><span>{settings.music}%</span></div><div className="center-controls"><button className="icon-btn" aria-label="Restart song" disabled={!current} onClick={() => player.current?.seek(0)}><RotateCcw size={19}/></button><button className="play-button" aria-label={playing ? "Pause song" : "Play song"} disabled={!current} onClick={() => playing ? player.current?.pause() : player.current?.play()}>{playing ? <Pause size={22} fill="currentColor"/> : <Play size={22} fill="currentColor"/>}</button><button className="icon-btn" aria-label="Next song" disabled={!queue.length} onClick={() => next()}><SkipForward size={21}/></button></div><span className="playback-hint">Sing like nobody’s listening.</span></div>
            </div>
            <div className="headphone-tip"><Headphones size={17}/><p>Headphones on. World off. <span>Use wired headphones for the best experience.</span></p></div>
          </section>

          <section className="audio-panel panel" id="sound-controls" aria-label="Microphone and effects">
            <div className="panel-heading"><div><SlidersHorizontal size={18}/><h2>Your sound</h2></div><span className="tiny-label">AUDIO</span></div>
            <div className="mic-status"><div className={`mic-symbol ${connected && !muted ? "on" : ""}`}>{muted ? <MicOff size={25}/> : <Mic size={25}/>}</div><div><h3>{busy ? "Connecting…" : connected ? muted ? "Taking a breather" : "You’re on the mic" : "Let’s hear you"}</h3><p>{connected ? muted ? "Unmute when you're ready to sing" : "Speak to check your input level" : "Built-in or external microphone"}</p></div></div>
            <div className="meter" aria-label={`Microphone input level: ${Math.round(level)} percent`}>{Array.from({length:24}, (_, i) => <i key={i} className={connected && !muted && level > i / 24 * 100 ? "lit" : ""}/>)}</div>
            <label className="field-label" htmlFor="microphone">Input device</label><div className="select-wrap"><Mic size={16}/><select id="microphone" value={device} onChange={e => { setDevice(e.target.value); if (connected) void connectMic(e.target.value); }} disabled={busy}><option value="">System default microphone</option>{devices.filter(d => d.deviceId !== "default").map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}</select><ChevronDown size={14}/></div>
            <button className={`mic-button ${connected ? "connected" : ""}`} disabled={busy} onClick={() => { if (!connected) void connectMic(); else { setMuted(v => !v); void mic.current?.context.resume(); } }}>{busy ? <LoaderCircle className="spin" size={17}/> : connected && !muted ? <MicOff size={17}/> : <Mic size={17}/>} {busy ? "Connecting microphone" : !connected ? "Connect microphone" : muted ? "Unmute microphone" : "Mute microphone"}</button>
            {busy && <p className="effects-note" role="status">Check your browser for a microphone permission request.</p>}
            {connected && <button className="disconnect" onClick={disconnectMic}>Disconnect microphone</button>}
            <Range label="Microphone volume" max={150} value={settings.mic} onChange={n => update("mic", n)}/>
            <div className="monitor-row"><div><Headphones size={17}/><span>Hear myself</span><button className="info-dot" aria-label="About microphone monitoring" onClick={() => setNotice("Monitoring plays your mic through your headphones. Keep it off when using speakers to prevent feedback.")}>?</button></div><button role="switch" aria-checked={monitor} aria-label="Hear myself" className={`switch ${monitor ? "enabled" : ""}`} onClick={() => setMonitor(v => !v)}><span/></button></div>
            <p className="monitor-hint">{connected && !monitor ? "Want to hear your voice? Put on headphones, then turn on Hear myself." : "Keep monitoring off when using speakers to avoid feedback."}</p>
            <details className="effects-details">
              <summary><Sparkles size={17}/><span>Vocal effects</span><ChevronDown size={17}/></summary>
              <div><div className="effects-heading"><span>Make it your sound</span><button onClick={() => { update("echo", 0); update("reverb", 0); }} className="text-button">Reset effects</button></div>
              <Range label="Echo" value={settings.echo} onChange={n => update("echo", n)}/><Range label="Reverb" value={settings.reverb} onChange={n => update("reverb", n)}/>
              <p className="effects-note">Turn on Hear myself to hear your vocal effects.</p></div>
            </details>
          </section>

          <section className="setlist panel" id="setlist" aria-label="Song queue">
            <div className="setlist-header"><div className="tabs" role="tablist" aria-label="Song lists" onKeyDown={e => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const nextTab = e.key === "Home" ? "queue" : e.key === "End" ? "history" : tab === "queue" ? "history" : "queue";
              setTab(nextTab); document.getElementById(`${nextTab}-tab`)?.focus();
            }}><button id="queue-tab" role="tab" tabIndex={tab === "queue" ? 0 : -1} aria-selected={tab === "queue"} aria-controls="song-list" className={tab === "queue" ? "selected" : ""} onClick={() => setTab("queue")}><ListMusic size={18}/>Up next<span>{queue.length}</span></button><button id="history-tab" role="tab" tabIndex={tab === "history" ? 0 : -1} aria-selected={tab === "history"} aria-controls="song-list" className={tab === "history" ? "selected" : ""} onClick={() => setTab("history")}><Clock3 size={16}/>Recently played</button></div><button className="add-song-button" onClick={openSong}><Plus size={16}/>Add a song</button></div>
            <div id="song-list" role="tabpanel" aria-labelledby={tab === "queue" ? "queue-tab" : "history-tab"}>
              {tab === "queue" && current && <div className="current-queue-row"><div className="track-icon"><Music2 size={20}/></div><div className="song-details"><span className="on-stage-label">ON STAGE</span><strong>{current.title}</strong></div><span className="current-playback-label">{playing ? "Playing" : "Ready"}</span><button className="icon-btn" aria-label="Remove current song from setlist" onClick={clearCurrent}><Trash2 size={18}/></button></div>}
              {!listed.length ? <div className="queue-empty"><div className="queue-illustration"><ListMusic size={29} strokeWidth={1.5}/><span><Plus size={12}/></span></div><div><h3>{tab === "queue" ? (current ? "Keep the music going." : "Your setlist starts here.") : "Your greatest hits start here."}</h3><p>{tab === "queue" ? "Add your favorites and they'll play one after another." : "Songs you load will appear here, ready for another encore."}</p></div><button className="text-button orange" onClick={openSong}>{current ? "Add another song" : "Add your first song"} <Plus size={14}/></button></div> : <ol className="song-list">{listed.map((song, i) => <li key={song.id}><span className="song-number">{String(i + 1).padStart(2,"0")}</span><div className="song-thumb"><Music2 size={20}/></div><div className="song-details"><strong>{song.title}</strong><span>YouTube · Karaoke</span></div><button className="icon-btn" aria-label={`Play ${song.title}`} onClick={() => { select(song, true); if (tab === "queue") setQueue(q => q.filter(s => s.id !== song.id)); }}><Play size={17}/></button><button className="icon-btn remove-song" aria-label={`Remove ${song.title}`} onClick={() => removeSong(song)}><Trash2 size={16}/></button></li>)}</ol>}
            </div>
          </section>

          <section className="discovery-card"><div className="discovery-icon"><Music2 size={23}/></div><h2>What’s your<br/>sing-along mood?</h2><p>Your next anthem is a search away.</p><div className="mood-chips">{["Pop anthems", "90s throwbacks", "Acoustic favorites"].map(mood => <button key={mood} onClick={() => youtubeSearch(mood)}>{mood}<ExternalLink size={12}/></button>)}</div><span>Explore on YouTube, then paste a link here.</span></section>
        </div>
        <footer><span className="footer-brand">encore.</span><p>A little music goes a long way.</p><span><ShieldCheck size={14}/>Your microphone audio stays on your device.</span></footer>
      </main>
    </div>
    <nav className="mobile-studio-nav" aria-label="Studio sections"><button onClick={() => goTo("studio")}><Radio size={19}/>Studio</button><button onClick={() => goTo("setlist")}><ListMusic size={19}/>Songs{queue.length > 0 && <span>{queue.length}</span>}</button><button onClick={() => goTo("sound-controls")}><SlidersHorizontal size={19}/>Sound</button></nav>
    {notice && <div className="toast" role="status"><Check size={18}/><span>{notice}</span></div>}
    <dialog ref={modal} onCancel={() => setDialog(null)} onClick={e => { if (e.target === modal.current) setDialog(null); }} aria-labelledby="dialog-title">
      <div className="dialog-content"><button className="dialog-close icon-btn" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={21}/></button>
        {dialog === "song" ? <><div className="dialog-icon"><Music2 size={25}/></div><h2 id="dialog-title">Find your next encore.</h2><p>Bring a karaoke track from YouTube to your stage.</p><form onSubmit={addSong}><label htmlFor="video-url">YouTube link or video ID</label><div className="text-input"><Link2 size={18}/><input id="video-url" aria-invalid={Boolean(songError)} aria-describedby={songError ? "song-error" : "link-help"} autoFocus required value={url} onChange={e => { setUrl(e.target.value); setSongError(""); }} placeholder="https://www.youtube.com/watch?v=…" maxLength={2048}/></div><p className="input-hint" id="link-help">Paste a watch, share, Shorts, or live video link.</p><label htmlFor="song-title">Song title <span className="subtle">(optional)</span></label><div className="text-input"><Music2 size={18}/><input id="song-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your track a name" maxLength={150}/></div>{songError && <p className="form-error" id="song-error" role="alert">{songError}</p>}<button className="primary-button" type="submit"><Plus size={18}/>{current ? "Add to queue" : "Add to my stage"}</button></form><div className="dialog-divider"><span>Need a little inspiration?</span></div><form className="search-form" onSubmit={e => { e.preventDefault(); youtubeSearch(); }}><div className="text-input"><Search size={18}/><input aria-label="Find karaoke on YouTube" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for an artist or song" maxLength={150}/></div><button className="secondary-button" type="submit">YouTube<ExternalLink size={15}/></button></form><small>Search opens YouTube in a new tab. Copy a video link and paste it above. No API key needed.</small></> : <><div className="dialog-icon"><Headphones size={25}/></div><h2 id="dialog-title">Your solo sound check.</h2><p>Three small steps. One great performance.</p><ol className="help-steps"><li><Music2/><div><strong>Pick your song</strong><p>Find a karaoke video on YouTube, copy its link, and use “Add a song”. Press play in the player.</p></div></li><li><Mic/><div><strong>Connect your microphone</strong><p>Allow microphone access when prompted. Choose your built-in or external mic under Input device.</p></div></li><li><Headphones/><div><strong>Put on wired headphones</strong><p>Turn on “Hear myself” to monitor your voice. Add a little echo or reverb to taste. Keep monitoring off with speakers to prevent feedback.</p></div></li></ol><div className="privacy-note"><ShieldCheck size={20}/><p>Microphone audio is processed on your device and is never recorded or uploaded. Your setlist is saved in this browser. YouTube playback connects to Google.</p></div><button className="primary-button" onClick={() => setDialog(null)}>Back to the studio</button></>}
      </div>
    </dialog>
  </div>;
}
