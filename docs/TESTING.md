# Verification

Run in `karoke-pool-frontend/`:

```sh
npm test
npm run typecheck
npm run build
```

Automated input tests cover supported video formats, lookalike-domain rejection, malformed links and corrupted persisted song records. Type checking and a production build check the complete frontend. They do not prove real YouTube or microphone behavior.

## Manual browser acceptance checklist

- Open the empty studio at desktop and mobile widths. Confirm there is no horizontal overflow and controls remain reachable.
- Navigate the song dialog with the keyboard; check focus stays in the dialog and Escape closes it.
- Add a valid embeddable YouTube karaoke URL; confirm the official video loads with its original controls and advertisements.
- Paste an invalid URL and a lookalike YouTube domain; check that a useful error appears.
- Add three named tracks. Play, pause, seek, restart, change volume, enter fullscreen, skip a track, play a queued item and remove an item.
- Remove the current song in Solo and Pool. Confirm the video iframe is removed, audio stops, the stage becomes empty and the time resets to 0:00; in Pool, verify this on both devices. Removing an unrelated upcoming song should leave current playback intact. Load a new song afterward and confirm the player works again.
- Allow a song to end. Confirm the next queued item loads and playback either begins or explains the browser's autoplay restriction.
- Try an embedding-restricted video and a disconnected network. Confirm errors are visible.
- Reload the page. Confirm the current track, queue, recent tracks and settings survive, and audio/microphone permission is not requested automatically.
- Deny microphone permission, then allow it in browser settings and retry. Check both paths.
- Connect the built-in microphone and an external microphone; change inputs while connected and unplug an active device.
- Wear wired headphones. Check the input meter, mute/unmute, independent mic/music volumes, monitoring, echo, reverb and effect reset.
- Disconnect the microphone; confirm the browser microphone indicator turns off. Navigate away and confirm capture also stops.
- Verify the application makes no microphone upload/recording requests. Browser requests to YouTube/Google are expected for video playback.
- Check on a mobile browser over HTTPS, including fullscreen support and browser autoplay restrictions.

Real microphone quality, effect latency, device switching and YouTube autoplay/embedding need a physical browser and audio device. Docker packaging also needs a Docker-enabled host.

## Implementation verification — 26 November 2026

- Four automated input-validation tests passed.
- TypeScript checking passed.
- The optimized Next.js production build passed.
- Local HTTP smoke checks passed for the page, main studio controls and stylesheet.
- No browser was connected to the test environment, so visual layout, live YouTube playback and real microphone behavior remain unverified. Use the acceptance checklist above before release.
- The Docker image has not been built or run in this environment.

## Phase-two party acceptance checks

- Stop the backend. Open Solo, add/play a song and use the microphone; confirm Solo never calls the backend.
- Open Karaoke Pool with the backend stopped. Confirm the unavailable notice and working Solo link. Retry after starting the backend.
- Configure an unreachable address and an incompatible health response; confirm each fails gracefully.
- Create a party on one device and join its invitation on another without an account. Confirm a fifth participant is rejected.
- Queue songs from both devices, select/remove as host, and verify play/pause/seek/next state reaches all clients.
- Test microphone permission denial, connect-muted behavior, unmute, individual volumes, monitoring and vocal effects on both devices.
- Test solo/duet/group/turn-based modes, singer selection, host mute/release, remove, lock/unlock and end. Verify guests cannot use host-only actions.
- Block signaling while connected. Confirm outgoing audio is muted, playback pauses, the unavailable notice appears and Solo is usable. Restore signaling within the grace period, then test a longer outage and a backend restart.
- Refresh a joined tab and verify reconnection. Close a host tab and verify host transfer after the grace period.
- Use two separate networks, including a restrictive network. Test TURN relay credentials and inspect WebRTC statistics.
- Compare actual microphone latency and YouTube drift across physical devices. Test buffering, embedded-video restrictions and browser autoplay blocks.
- Check that Pool sends only microphone audio to peers. Neither mode records audio; YouTube music stays in each participant's embedded player.

## Phase-two verification — 26 November 2026

- Ten FastAPI tests passed: health/input validation, room capacity/lock, queue/playback, host permissions, modes, moderation, signaling, session replacement, cleanup, limits and TURN credentials.
- Nine frontend tests passed, including backend connection failures, incompatible health replies, missing configuration, invitation parsing and singer eligibility.
- TypeScript and the optimized Next.js production build passed with both `/` and `/pool` routes.
- A live HTTP/two-client WebSocket smoke test passed for create, join, queue, synchronized playback state and room end.
- With the backend stopped, the real frontend service client produced the unavailable notification and both frontend routes still returned HTTP 200.
- Docker Compose configuration validates with the optional Pool profile. Docker images have not been built or run here.
- No browser is connected in this environment. Visual UI, real microphone/WebRTC media, autoplay and physical-device synchronization remain unverified.

## Vercel preparation and folder rename — 26 November 2026

- Frontend directory renamed to `karoke-pool-frontend`; Docker Compose and deployment documentation use the new path.
- Ten frontend tests passed, including a hosted-URL test confirming no localhost backend fallback when Pool is unconfigured.
- Production build with `VERCEL=1` passed with `/` and `/pool`, including TypeScript validation.
- Local/Docker configuration still selects standalone output; Vercel selects its native Next.js output.
- Docker Compose configuration validates after the rename. No Vercel deployment was created as part of this preparation.
