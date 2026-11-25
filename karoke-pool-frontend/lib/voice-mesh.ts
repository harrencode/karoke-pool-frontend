import { canSing, type PoolRoom, type Signal } from "./pool-types";

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; sender: RTCRtpSender; makingOffer: boolean; ignoreOffer: boolean; settingAnswer: boolean; pending: RTCIceCandidateInit[]; chain: Promise<void> };

export class VoiceMesh {
  peers = new Map<string, Peer>();
  stream: MediaStream | null = null;
  volumes = new Map<string, number>();
  active = true;
  room: PoolRoom | null = null;
  constructor(public self: string, public iceServers: RTCIceServer[], public send: (id: string, data: Signal) => void, public report: (message: string) => void) {}
  ensure(id: string): Peer {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.volume = this.volumes.get(id) ?? 1;
    audio.muted = true; // Do not play a peer until room policy has been applied.
    const sender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    const peer: Peer = { pc, audio, sender, makingOffer: false, ignoreOffer: false, settingAnswer: false, pending: [], chain: Promise.resolve() };
    this.peers.set(id, peer);
    if (this.stream) void sender.replaceTrack(this.stream.getAudioTracks()[0]).catch(() => {});
    pc.ontrack = event => {
      audio.srcObject = new MediaStream([event.track]);
      this.applyPolicy();
      void audio.play().catch(() => { if (this.active) this.report("Tap Enable room audio to hear the other singers."); });
    };
    pc.onicecandidate = e => { if (this.active && e.candidate) this.send(id, { candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (this.active && pc.connectionState === "failed") this.report("A voice connection failed. Try Reconnect room; some networks require a configured TURN relay.");
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (this.active) this.send(id, { description: pc.localDescription!.toJSON() });
      } catch { if (this.active) this.report("Could not connect room audio. Try Reconnect room."); }
      finally { peer.makingOffer = false; }
    };
    return peer;
  }
  signal(id: string, data: Signal) {
    if (!this.active) return;
    const p = this.ensure(id);
    // Process each peer's offer/answer/candidates in arrival order.
    p.chain = p.chain.then(async () => {
      if (!this.active || p.pc.signalingState === "closed") return;
      if (data.description) {
        const ready = !p.makingOffer && (p.pc.signalingState === "stable" || p.settingAnswer);
        const collision = data.description.type === "offer" && !ready;
        p.ignoreOffer = this.self < id && collision;
        if (p.ignoreOffer) { p.pending = []; return; }
        p.settingAnswer = data.description.type === "answer";
        try { await p.pc.setRemoteDescription(data.description); } finally { p.settingAnswer = false; }
        for (const candidate of p.pending.splice(0)) await p.pc.addIceCandidate(candidate);
        if (data.description.type === "offer") {
          await p.pc.setLocalDescription();
          if (this.active) this.send(id, { description: p.pc.localDescription!.toJSON() });
        }
      } else if (data.candidate && !p.ignoreOffer) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate);
        else if (p.pending.length < 100) p.pending.push(data.candidate);
      }
    }).catch(() => { if (this.active) this.report("A voice connection was interrupted. Try Reconnect room if you cannot hear a singer."); });
  }
  setStream(stream: MediaStream | null) {
    this.stream = stream;
    this.peers.forEach(p => { void p.sender.replaceTrack(stream?.getAudioTracks()[0] || null).catch(() => {}); });
  }
  setVolume(id: string, volume: number) {
    this.volumes.set(id, volume);
    const peer = this.peers.get(id); if (peer) peer.audio.volume = volume;
  }
  updateIce(servers: RTCIceServer[]) {
    this.iceServers = servers;
    this.peers.forEach(p => p.pc.setConfiguration({ iceServers: servers }));
  }
  applyPolicy() {
    if (!this.room) return;
    this.peers.forEach((p, id) => {
      const member = this.room!.members.find(m => m.id === id);
      p.audio.muted = !member || member.muted || !canSing(this.room!, id);
    });
  }
  reconcile(room: PoolRoom) {
    this.room = room;
    const ids = room.members.filter(m => m.connected).map(m => m.id);
    for (const [id, p] of this.peers) if (!ids.includes(id)) { p.pc.close(); p.audio.pause(); p.audio.srcObject = null; this.peers.delete(id); }
    ids.filter(id => id !== this.self).forEach(id => this.ensure(id));
    this.applyPolicy();
  }
  resume() { this.peers.forEach(p => { void p.audio.play().catch(() => {}); }); }
  close() {
    this.active = false;
    for (const p of this.peers.values()) { p.pc.close(); p.audio.pause(); p.audio.srcObject = null; }
    this.peers.clear();
  }
}
