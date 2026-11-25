# Encore Karaoke Pool backend

This is the independent FastAPI service used **only by Karaoke Pool**. The solo frontend works with this service stopped or absent.

## Run locally

Requires Python 3.11 or newer. From `backend/`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --env-file .env --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 32768
```

On macOS/Linux use `.venv/bin/python` in place of `.venv\Scripts\python`. API docs: http://localhost:8000/docs. Health: http://localhost:8000/health.

```sh
python -m pytest -q
```

## API and room behavior

- `GET /health`: Pool-specific protocol check; no credentials needed.
- `POST /api/rooms` with `{ "name": "Your name" }`: create a private room and return a guest ticket.
- `POST /api/rooms/{room_id}/join` with the same body: reserve a guest slot. Locked/full/expired rooms return an explanation.
- `WS /ws/{room_id}`: the first message is `{ "token": "guest-ticket-token" }`. Tokens are never placed in URLs or public room snapshots. Subsequent messages use the validated command schema in `app/main.py`.
- Server events: `welcome` (ICE configuration), `state` (versioned room snapshot), `signal` (peer SDP/ICE), `pong` (server clock and periodic credential refresh), `error` (command rejection).
- Shared actions: queue addition, own mute, voice signaling, heartbeat and leave. The backend authorizes every host action: playback, queue removal/selection, mode/singers, lock, moderation and end.

Rooms hold up to four participants and fifty queued songs. They expire after six hours by default. Guests have a thirty-second reconnection grace period; unconnected reservations are released after the same period. The host role transfers on explicit leave or grace expiry. Mute release never unmutes someone automatically.

## Configuration

See `.env.example`. `ALLOWED_ORIGINS` must match the frontend origin exactly, including scheme and port. REST CORS and WebSocket origins use the same allowlist. Use HTTPS/WSS outside localhost.

For calls over the Internet, configure a TURN relay. Set `TURN_URLS` to comma-separated TURN URLs and `TURN_SECRET` to the relay's shared authentication secret (coturn `use-auth-secret`). The service issues one-hour HMAC credentials and refreshes them through the room heartbeat. The shared secret stays on the backend. Without TURN, direct voice works only when network conditions permit it.

This MVP uses ephemeral in-memory rooms. Run **one worker and one replica**. A restart ends all rooms; the frontend reports the loss and retains Solo access. Redis state plus pub/sub must be implemented before enabling multiple workers or replicas. No database or audio storage is used.

Voice is a four-person browser-to-browser WebRTC mesh. The server only relays signaling. All shipped clients enforce host mute and singer policy on outgoing tracks and received audio; an SFU is needed for server-enforced audio moderation against modified clients. YouTube audio is never sent through this backend.
