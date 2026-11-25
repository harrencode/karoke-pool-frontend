"""Four-person ephemeral room service. Run ONE worker; audio is peer-to-peer."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

ORIGINS = [s.strip() for s in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if s.strip()]
ROOM_TTL = int(os.getenv("ROOM_TTL_SECONDS", "21600"))
RECONNECT_SECONDS = int(os.getenv("RECONNECT_SECONDS", "30"))
MAX_ROOMS = int(os.getenv("MAX_ROOMS", "500"))


class Guest(BaseModel):
    name: str = Field(min_length=1, max_length=32)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Enter a display name")
        return value


class Song(BaseModel):
    video_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{11}$")
    title: str = Field(min_length=1, max_length=150)


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["ping", "signal", "queue_add", "queue_remove", "play", "pause", "seek", "next", "select", "mode", "singers", "lock", "mute", "remove", "end", "self_mute", "leave"]
    target: str | None = Field(default=None, max_length=100)
    song: Song | None = None
    position: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    value: bool = False
    mode: Literal["solo", "duet", "group", "turn-based"] = "group"
    ids: list[str] = Field(default_factory=list, max_length=4)
    data: dict | None = None


@dataclass
class Member:
    name: str
    id: str = field(default_factory=lambda: secrets.token_urlsafe(12))
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    muted: bool = True
    forced_muted: bool = False
    ws: WebSocket | None = None
    last_seen: float = field(default_factory=time.time)
    ice_issued_at: float = 0


@dataclass
class Room:
    host: str
    members: dict[str, Member]
    id: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    queue: list[dict] = field(default_factory=list)
    current: dict | None = None
    playing: bool = False
    position: float = 0
    updated_at: float = field(default_factory=time.time)
    created_at: float = field(default_factory=time.time)
    mode: str = "group"
    singers: list[str] = field(default_factory=list)
    locked: bool = False
    revision: int = 0
    mutex: asyncio.Lock = field(default_factory=asyncio.Lock)

    def snapshot(self):
        return {"id": self.id, "host": self.host, "members": [
            {"id": m.id, "name": m.name, "muted": m.muted, "forced_muted": m.forced_muted, "connected": m.ws is not None}
            for m in self.members.values()], "queue": self.queue, "current": self.current,
            "playing": self.playing, "position": self.position, "updated_at": self.updated_at,
            "server_time": time.time(), "mode": self.mode, "singers": self.singers, "locked": self.locked, "revision": self.revision}


rooms: dict[str, Room] = {}
attempts: dict[str, deque] = defaultdict(deque)


def throttle(request: Request):
    now = time.time()
    key = request.client.host if request.client else "unknown"
    hits = attempts[key]
    while hits and hits[0] < now - 60:
        hits.popleft()
    if len(hits) >= 30:
        raise HTTPException(429, "Too many requests. Please wait a minute.")
    hits.append(now)


def ice_servers(member_id: str):
    servers = [{"urls": os.getenv("STUN_URL", "stun:stun.l.google.com:19302")}]
    secret, urls = os.getenv("TURN_SECRET"), os.getenv("TURN_URLS")
    if secret and urls:
        username = f"{int(time.time()) + 3600}:{member_id}"
        credential = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
        servers.append({"urls": urls.split(","), "username": username, "credential": credential})
    return servers


def ticket(room: Room, member: Member):
    return {"room_id": room.id, "member_id": member.id, "token": member.token}


def get_room(room_id: str):
    room = rooms.get(room_id)
    if not room or time.time() - room.created_at > ROOM_TTL:
        raise HTTPException(404, "This room has ended or expired.")
    return room


async def send(ws: WebSocket, data: dict):
    try:
        await asyncio.wait_for(ws.send_json(data), timeout=2)
    except (RuntimeError, WebSocketDisconnect, OSError, asyncio.TimeoutError):
        pass


async def close(ws: WebSocket, code: int, reason: str):
    try:
        await asyncio.wait_for(ws.close(code, reason), timeout=2)
    except (RuntimeError, WebSocketDisconnect, OSError, asyncio.TimeoutError):
        pass


async def broadcast(room: Room):
    room.revision += 1
    payload = {"type": "state", "room": room.snapshot()}
    await asyncio.gather(*(send(m.ws, payload) for m in room.members.values() if m.ws))


def drop_member(room: Room, member_id: str):
    room.members.pop(member_id, None)
    room.singers = [i for i in room.singers if i != member_id]
    if not room.members:
        rooms.pop(room.id, None)
    else:
        if room.host == member_id:
            room.host = next((m.id for m in room.members.values() if m.ws), next(iter(room.members)))
        if room.mode != "group" and not room.singers:
            room.singers = [room.host]


async def sweep():
    now = time.time()
    for room in list(rooms.values()):
        async with room.mutex:
            if now - room.created_at > ROOM_TTL:
                rooms.pop(room.id, None)
                await asyncio.gather(*(close(m.ws, 4000, "Room expired") for m in room.members.values() if m.ws))
                continue
            stale = [m.id for m in room.members.values() if m.ws is None and now - m.last_seen > RECONNECT_SECONDS]
            for mid in stale:
                drop_member(room, mid)
            if stale:
                await broadcast(room)
    for key in list(attempts):
        if not attempts[key] or attempts[key][-1] < now - 60:
            attempts.pop(key, None)


async def cleanup():
    while True:
        await asyncio.sleep(5)
        await sweep()


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(cleanup())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Encore Karaoke Pool API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "encore-pool", "protocol": 1}


@app.post("/api/rooms", status_code=201)
async def create_room(guest: Guest, request: Request):
    throttle(request)
    if len(rooms) >= MAX_ROOMS:
        raise HTTPException(503, "All stages are busy. Try again shortly.")
    m = Member(guest.name)
    room = Room(m.id, {m.id: m})
    rooms[room.id] = room
    return ticket(room, m)


@app.post("/api/rooms/{room_id}/join")
async def join_room(room_id: str, guest: Guest, request: Request):
    throttle(request)
    room = get_room(room_id)
    async with room.mutex:
        if room.locked:
            raise HTTPException(403, "The host has locked this room.")
        if len(room.members) >= 4:
            raise HTTPException(409, "This room is full (four participants maximum).")
        m = Member(guest.name)
        room.members[m.id] = m
        return ticket(room, m)


HOST_ACTIONS = {"queue_remove", "play", "pause", "seek", "next", "select", "mode", "singers", "lock", "mute", "remove", "end"}


async def handle(room: Room, m: Member, cmd: Command):
    if not m.ws:
        return
    if cmd.type in HOST_ACTIONS and m.id != room.host:
        raise ValueError("Only the host can use this control.")
    if cmd.type == "ping":
        payload = {"type": "pong", "server_time": time.time()}
        if time.time() - m.ice_issued_at > 1800:
            payload["ice_servers"] = ice_servers(m.id)
            m.ice_issued_at = time.time()
        await send(m.ws, payload)
        return
    if cmd.type == "signal":
        target = room.members.get(cmd.target or "")
        if target and target.ws and target.id != m.id and cmd.data:
            await send(target.ws, {"type": "signal", "from": m.id, "data": cmd.data})
        return
    if cmd.type == "leave":
        ws = m.ws
        drop_member(room, m.id)
        await close(ws, 4000, "You left the room")
    elif cmd.type == "self_mute":
        if not cmd.value and (m.forced_muted or (room.mode != "group" and m.id not in room.singers)):
            raise ValueError("The host has muted you or selected other singers.")
        m.muted = cmd.value
    elif cmd.type == "queue_add":
        if not cmd.song:
            raise ValueError("Choose a song first.")
        if len(room.queue) >= 50:
            raise ValueError("The queue is full (50 songs).")
        song = {**cmd.song.model_dump(), "id": secrets.token_urlsafe(8), "added_by": m.name}
        if room.current is None:
            room.current = song
            room.position, room.updated_at = 0, time.time()
        else:
            room.queue.append(song)
    elif cmd.type in ("play", "pause", "seek"):
        if not room.current:
            raise ValueError("Add a song first.")
        now = time.time()
        # Host sends its observed player position, accounting for buffering/ads.
        room.position = cmd.position
        if cmd.type != "seek":
            room.playing = cmd.type == "play"
        room.updated_at = now
    elif cmd.type in ("next", "select"):
        if cmd.type == "select":
            song = next((s for s in room.queue if s["id"] == cmd.target), None)
            if not song:
                raise ValueError("This song is no longer in the queue.")
            room.queue.remove(song)
            room.current = song
        else:
            room.current = room.queue.pop(0) if room.queue else None
        room.position, room.updated_at = 0, time.time()
        room.playing = room.current is not None
        if room.mode == "turn-based" and room.members:
            ids = list(room.members)
            previous = room.singers[0] if room.singers else ids[-1]
            room.singers = [ids[(ids.index(previous) + 1) % len(ids)]]
    elif cmd.type == "queue_remove":
        room.queue = [s for s in room.queue if s["id"] != cmd.target]
        if room.current and room.current["id"] == cmd.target:
            room.current = None
            room.playing = False
            room.position, room.updated_at = 0, time.time()
    elif cmd.type == "mode":
        room.mode = cmd.mode
        count = 2 if cmd.mode == "duet" else 1
        room.singers = list(room.members)[:count] if cmd.mode != "group" else []
    elif cmd.type == "singers":
        limit = 2 if room.mode == "duet" else 1
        if room.mode == "group" or len(set(cmd.ids)) != len(cmd.ids) or any(i not in room.members for i in cmd.ids) or not 1 <= len(cmd.ids) <= limit:
            raise ValueError("Select one singer, or up to two in duet mode.")
        room.singers = cmd.ids
    elif cmd.type == "lock":
        room.locked = cmd.value
    elif cmd.type in ("mute", "remove"):
        target = room.members.get(cmd.target or "")
        if not target or target.id == m.id:
            raise ValueError("Choose another participant.")
        if cmd.type == "mute":
            target.forced_muted = cmd.value
            if cmd.value:
                target.muted = True
        else:
            drop_member(room, target.id)
            if target.ws:
                await close(target.ws, 4003, "Removed by the host")
    elif cmd.type == "end":
        rooms.pop(room.id, None)
        await asyncio.gather(*(close(p.ws, 4000, "The host ended the session") for p in room.members.values() if p.ws))
        return
    if room.mode != "group":
        for p in room.members.values():
            if p.id not in room.singers:
                p.muted = True
    await broadcast(room)


@app.websocket("/ws/{room_id}")
async def websocket(ws: WebSocket, room_id: str):
    if ws.headers.get("origin") not in ORIGINS:
        await ws.close(1008)
        return
    await ws.accept()
    room, m = None, None
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=10)
        if len(raw) > 1024:
            await close(ws, 4003, "Invalid guest credential")
            return
        auth = json.loads(raw)
        room = get_room(room_id)
        if not isinstance(auth, dict) or not isinstance(auth.get("token"), str) or not auth["token"].isascii() or len(auth["token"]) > 100:
            await close(ws, 4003, "Invalid guest credential")
            return
        async with room.mutex:
            m = next((p for p in room.members.values() if secrets.compare_digest(p.token, auth["token"])), None)
            if not m:
                await close(ws, 4003, "Invalid guest credential")
                return
            old = m.ws
            if old:
                m.ws = None
                await broadcast(room)
                await close(old, 4001, "Connected in another tab")
            m.ws = ws
            m.ice_issued_at = time.time()
            await send(ws, {"type": "welcome", "ice_servers": ice_servers(m.id)})
            await broadcast(room)
        events = deque()
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=45)
            now = time.time()
            while events and events[0] < now - 10:
                events.popleft()
            if len(raw) > 32768 or len(events) >= 150:
                await close(ws, 1008, "Message limit exceeded")
                break
            events.append(now)
            try:
                cmd = Command.model_validate_json(raw)
                async with room.mutex:
                    if room.id not in rooms or m.id not in room.members or m.ws is not ws:
                        break
                    m.last_seen = now
                    await handle(room, m, cmd)
                    if m.id not in room.members or room.id not in rooms:
                        break
            except ValidationError:
                await send(ws, {"type": "error", "message": "Invalid room command."})
            except ValueError as exc:
                await send(ws, {"type": "error", "message": str(exc)})
    except HTTPException as exc:
        await close(ws, 4004, str(exc.detail))
    except (asyncio.TimeoutError, json.JSONDecodeError):
        await close(ws, 1008, "Connection timed out or sent invalid JSON")
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if m and room:
            async with room.mutex:
                if m.ws is ws:
                    m.ws = None
                    m.last_seen = time.time()
                    if room.id in rooms and m.id in room.members:
                        await broadcast(room)
