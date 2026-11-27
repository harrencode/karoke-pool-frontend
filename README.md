# Encore Karaoke

A karaoke studio with two independent modes:

- **Solo karaoke** at `/`: YouTube playback, local queue, microphone selection, monitoring, echo and reverb. No backend, API key or account is needed.
- **Karaoke Pool** at `/pool`: private four-person parties, guest invitations, shared queue, synchronized playback, peer-to-peer microphone audio and host controls. Only this mode needs the separate backend.

If the backend is missing, offline, incompatible or times out, the Pool screen displays **“Karaoke Pool party is not available right now”** and offers Solo karaoke. Solo never performs a Pool health check or waits for the backend. An interrupted party pauses shared playback, mutes outgoing voice and attempts to reconnect, with Solo available throughout.

## Run the frontend

Requires Node.js 22 and npm:

```sh
cd karoke-pool-frontend
npm ci
npm run dev
```

Open http://localhost:3000. `npm run build` and `npm start` provide the production build/server. The solo studio works immediately. Pool checks http://localhost:8000 only when its page is opened on localhost.

For another host, copy `karoke-pool-frontend/.env.example` to `karoke-pool-frontend/.env.local`, set `NEXT_PUBLIC_POOL_API_URL` to your backend's HTTPS origin and rebuild/restart the frontend. This is a public origin, never a secret. A hosted frontend without a configured backend simply reports Pool unavailable.

## Deploy on Vercel

Import your GitHub repository into Vercel and choose **`karoke-pool-frontend` as Root Directory** with the **Next.js** preset. Node 22.x and build/install commands are configured in the frontend. Leave environment variables empty to deploy Solo; Pool will show its unavailable notice.

The [Vercel deployment guide](docs/VERCEL.md) covers exact settings, HTTPS microphone testing and connecting the optional backend later. The FastAPI service remains separate. This repository is prepared for deployment; it has not been published to Vercel.

## Enable Karaoke Pool

Follow `backend/README.md` to install and run the independent FastAPI service on port 8000. Then open **Karaoke Pool**, enter a display name and create a party. Copy the invitation to friends. Each participant explicitly connects and unmutes their microphone.

The host controls the shared player, queued song selection/removal, singing mode, selected singers, room lock, participant mute/removal and ending the party. Modes are solo, duet, group and turn-based. Everyone can add songs and adjust local music and participant volumes.

Use the shared playback controls to synchronize the room. Native YouTube controls affect only your own player. Each browser checks alignment every second and corrects drift greater than 0.5 seconds, with an immediate check when returning to the tab. Correction waits while YouTube buffers, then catches up when playback resumes. These local checks do not add backend requests. Use **Enable room audio** if the browser blocks autoplay. Wired headphones work best. Real networks cannot guarantee perfectly synchronized singing; advertisements and buffering also affect YouTube alignment.

## Docker

From the root:

```sh
# Frontend only; Pool will show its unavailable notice.
docker compose up --build

# Frontend plus the optional Pool backend.
docker compose --profile pool up --build
```

The frontend has no `depends_on` relationship with the backend. To share beyond the same computer, set the public `NEXT_PUBLIC_POOL_API_URL` build argument and the backend's `ALLOWED_ORIGINS`. Use HTTPS/WSS and configure TURN for restricted networks. The browser must reach the public backend URL; a Docker service name such as `backend:8000` is not a public browser address.

## Use solo karaoke

1. Choose **Add a song**, paste a YouTube video URL or ID and optionally name the track.
2. Press play, connect your microphone and grant permission.
3. Wear wired headphones and turn on **Hear myself** to monitor your voice.
4. Set music/microphone volumes and vocal effects independently. Add more songs to your queue.

Song discovery opens YouTube searches in another tab; copy a karaoke video link back into the app. No YouTube Data API key is required. Original player controls and advertisements remain intact; audio is never downloaded or extracted. Some videos prohibit embedding or are region-restricted.

Solo saves its setlist, recent tracks and sound settings in this browser. Party state is separate, held temporarily by the backend; private guest tickets stay in session storage for reconnection. Microphone access is never granted automatically. Solo microphone processing stays on your device; in Pool, unmuted microphone audio is transmitted to the other room participants. Neither mode records or stores microphone audio.

Microphone access requires localhost or HTTPS. A plain HTTP LAN address generally cannot request microphone permission. Bluetooth and device hardware can introduce monitoring delay.

## Structure and checks

- `karoke-pool-frontend/`: Next.js, TypeScript, Tailwind, YouTube and Web Audio/WebRTC client.
- `backend/`: separate FastAPI REST/WebSocket service with its own dependencies and Dockerfile.
- `docs/PLAN.md`: implementation details and remaining scaling work.
- `docs/TESTING.md`: automated and physical-device checks.

```sh
cd karoke-pool-frontend
npm test
npm run typecheck
npm run build
```

```sh
cd backend
python -m pytest -q
```

The backend currently supports one worker/replica and ephemeral rooms. Redis and cross-worker broadcasts remain a future scaling step. Configure a TURN relay before relying on Internet voice connections. See the [official YouTube player reference](https://developers.google.com/youtube/iframe_api_reference), [FastAPI WebSockets guide](https://fastapi.tiangolo.com/advanced/websockets/) and [WebRTC negotiation reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) for the underlying integrations.

## Live audience mix (Solo)

Use headphones as the computer's default sound output and connect a separate set of speakers or an audio interface. In Solo, connect/unmute the microphone and add a song. Under **Live audience mix**, choose **Share song tab**, select this Solo studio tab, and enable **Share tab audio**. Then choose **Open audience output**, select the separate speakers, and enable audience sound. Desktop Chrome/Edge with tab-audio capture and output-device selection are required; no backend is involved.

The singer follows the original song and video lyrics. Only the audience's copy of the music is delayed and mixed with the processed microphone. Adjust **Song delay for the audience** between 0 and 2,000 ms: increase it if the voice arrives late; decrease it if the voice arrives early. The 150 ms initial setting is a guess, not automatic calibration. This does not change the lyrics timing or room playback sync.

Monitoring is kept off during sharing, and the audience mix is played only by the separate window. Share the studio tab, never the audience window or entire screen. Default-output aliases and, when reported, the default headphones' physical device are excluded from audience output choices. Stop sharing, disconnect the microphone, remove the current song, close the audience window, or leave Solo to end the mix. Nothing is recorded or uploaded. Real Bluetooth/speaker alignment requires listening and adjustment on the actual devices.
