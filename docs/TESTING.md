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
- During Pool playback, introduce a seek mismatch on a guest and confirm the one-second check corrects drift over 0.5 seconds. Check both ahead and behind, shared pause, return from a background tab, recovery after buffering, and natural completion without repeated restarts. Browser background timer throttling can delay periodic checks while a tab is hidden.

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

## UI refresh acceptance checks

- At desktop, tablet, and 320px/375px mobile widths, check page overflow, player controls, setlist tabs, dialogs, and the mobile Studio / Songs / Sound navigation.
- Use the heading and empty-player song buttons. Submit an invalid link, correct it, add songs, switch lists with arrow keys, and remove the current song. Confirm the video clears.
- Connect, mute, and disconnect the microphone. Check permission feedback, input level, monitoring guidance, and the expandable vocal effects.
- In Pool, switch Create / Join, follow an invitation, copy/show/hide the room link, and check connection/microphone status. Confirm the native confirmation dialog supports Escape and keyboard focus.
- Stop the backend and confirm the Pool unavailable state links back to working Solo karaoke.
- Automated verification: 16 frontend tests and the Vercel production build (including TypeScript) passed. No connected browser was available for visual or real-media verification.

## Microphone monitoring latency

- Solo and Pool request minimum input latency and mono capture as preferences. Headphone monitoring disables echo cancellation and noise suppression; switching monitoring off restores both. Automatic gain control stays off.
- The AudioContext requests minimum output latency. Browsers and devices can ignore latency preferences; this does not guarantee a measured delay.
- With wired headphones and Echo/Reverb at zero, compare monitoring on/off, reconnect with monitoring already enabled, switch input devices, and quickly toggle monitoring. Verify mute/disconnect still silences output and Pool still sends the microphone only to allowed singers.
- Repeat with unsupported constraints and real Bluetooth/TV output. Hardware, browser buffering and network latency cannot be removed by these settings. Echo is intentionally a delayed effect; reverb adds a tail.
- Automated capture-policy tests cover headphone mode and restoring speaker echo protection. Physical audio latency remains unmeasured in this environment.
- Connect a microphone and open Microphone delay in Solo and Pool. Check that input, processing and output values refresh, and missing values say Not reported. A combined estimate appears only when all stages report valid values. It includes the dry-path compressor look-ahead; it is not a physical loopback measurement, a song-sync measurement, or a measurement of remote Pool voice.
- Compare wired and Bluetooth output on real devices. Bluetooth buffering may be absent from browser estimates. No microphone is recorded, and this readout plays no test sounds.

## Fast headphone monitoring

- Fast monitoring defaults on in Solo and Pool; Hear myself still requires an explicit opt-in. The local voice path bypasses vocal effects and compressor look-ahead, using a non-oversampled clamp for boosted input. Pool's processed outgoing stream still contains the selected effects.
- With headphones, toggle Fast monitoring with Hear myself on. Fast mode should provide one dry voice; normal mode should restore echo/reverb. Check mic volume, mute/disconnect, device switching, and Pool host mute/listening restrictions in both modes.
- Reconnect with fast mode disabled and confirm that choice applies immediately. Verify the delay readout excludes compressor look-ahead in fast mode and includes it in normal mode.
- Route regression tests and latency estimate tests pass. Real-device audible improvement and Bluetooth latency remain unmeasured; this change cannot remove Bluetooth/hardware buffering.

## Live compensated audience output

- On a desktop Chrome/Edge setup, use Bluetooth headphones as default output and separate USB/wired speakers for the audience. Connect and unmute the mic, choose a song, share the Solo tab with audio, open audience output, choose speakers, and enable sound. The singer should hear only the original music; the speakers should play delayed music plus mic.
- Adjust song delay live at 0, 150, 500 and 2,000 ms. Confirm only the audience music changes timing, not microphone audio, singer music, lyrics, or Pool sync. Increase delay for a late voice and decrease for an early voice. Alignment is manually calibrated, not automatically measured.
- Confirm monitoring is turned off and disabled while sharing, and neither mix route feeds back into the captured studio tab. Default output and headphone aliases must be excluded when device grouping is reported.
- Test sharing cancellation, sharing without audio, selecting a full screen/window, selecting the audience tab, denied speaker permission, popup blocking, and unsupported browsers. Confirm understandable errors and normal Solo use afterward. Capture-handle validation rejects the wrong tab on supporting browsers.
- Stop browser sharing, unplug the mic, switch mic devices, remove the current song, close the audience window, refresh, and leave Solo. Confirm capture indicators and mixed output stop. Disconnect an audience device; sound should pause and require a fresh output selection.
- Confirm a mic mute silences only the voice while the song continues. Check echo/reverb and mic gain in the audience stream. No MediaRecorder, recording download, or upload is used.
- Automated tests cover music-only delay routing, bounds/live delay changes, graph cleanup without stopping the studio microphone, and audience device filtering. No connected browser was available for physical tab-sharing, popup, sink-selection, or live-audio verification.
