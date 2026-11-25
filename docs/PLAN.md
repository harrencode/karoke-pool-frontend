# Implementation plan and status

## Solo karaoke — implemented

The independent frontend at `/` provides official YouTube playback, a browser-local queue/recent list, microphone selection, gain, mute, optional monitoring, echo/reverb, seeking and fullscreen. It never imports the Pool service client or waits for backend availability.

Audio flow: microphone → gain → dry signal plus echo/reverb → compressor → meter and optional monitoring. Solo audio stays on the device. Music remains inside the official YouTube embedded player.

## Karaoke Pool — implemented for one backend instance

The `/pool` route contains the lobby, backend health check and party screen. The independent FastAPI service lives in `backend/` with its own dependencies and Docker image.

| Capability | Current behavior |
| --- | --- |
| Optional service | Health check only on Pool entry; four-second HTTP timeout; useful unavailable notice and Solo link |
| Guest rooms | Private random identifiers, display names, token-authenticated sockets, no accounts |
| Invitations | Shareable room link; session-scoped guest ticket supports reload/reconnect |
| Limits | Four participants, fifty queued tracks, six-hour room TTL and admission/message limits |
| Membership | Connect, leave, reconnect grace, stale reservation cleanup and host transfer |
| Queue | Everyone adds tracks; host selects, removes or advances them |
| Playback | Server state/timestamps and clock estimate; check each second and correct drift over 0.5 seconds after buffering |
| Voice | WebRTC mesh using processed microphone tracks; per-participant local volume |
| Microphone | Explicit permission, connect muted, select input, mute/disconnect, monitoring and effects |
| Host controls | Play/pause/seek/next, mode, singer selection, lock/unlock, mute/remove, end |
| Modes | Solo, duet, group and turn-based rotation |
| TURN | Optional coturn shared secret; short-lived credentials, periodically refreshed |
| Outages | Pause playback, mute outgoing audio, retry signaling; Solo remains accessible |
| Packaging | Frontend-only Compose by default; backend under the optional `pool` profile |

Room membership, queue and guest tokens are ephemeral. Server restarts end rooms. Pool microphone audio travels directly to other participants; the service only relays signaling. Host mute and selected-singer policy are enforced by the shipped clients on both outgoing and incoming audio. Peer mesh does not provide authoritative server-side audio moderation against modified clients.

## Deferred work

- Redis room state and pub/sub before multiple workers or replicas. The current backend must run one worker/replica.
- An SFU such as LiveKit if larger rooms, centralized audio moderation or measured reliability requires it.
- Optional in-app YouTube Data API search. Both modes accept video links without an API key.
- Physical-device validation, TV remote navigation and a dedicated Android TV interface.
- Public rooms, profiles, scoring, webcams and recording are outside this release.

## Feasibility gate before public party release

Test two to four physical devices on different networks with wired headphones. Measure voice delay, WebRTC RTT/jitter/packet loss, TURN usage, YouTube drift, buffering recovery and reconnect behavior. Test desktop and mobile browsers over HTTPS. Use the results to decide whether simultaneous singing is usable; prefer turn-based mode if latency is too high. Configure a TURN relay before relying on calls across restricted networks, and measure its bandwidth costs.

YouTube advertisements, buffering and autoplay can prevent close synchronization. This implementation does not promise sample-accurate music or latency-free remote singing.
