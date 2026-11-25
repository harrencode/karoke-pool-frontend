import time
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import main as api

ORIGIN = {"origin": "http://localhost:3000"}


@pytest.fixture
def client():
    api.rooms.clear()
    api.attempts.clear()
    with TestClient(api.app) as client:
        yield client
    api.rooms.clear()


def create(client, name="Host"):
    response = client.post("/api/rooms", json={"name": name})
    assert response.status_code == 201
    return response.json()


def join(client, ticket, name="Guest"):
    response = client.post(f"/api/rooms/{ticket['room_id']}/join", json={"name": name})
    assert response.status_code == 200
    return response.json()


def message(ws, kind, predicate=lambda x: True):
    for _ in range(30):
        event = ws.receive_json()
        if event["type"] == kind and predicate(event):
            return event
    raise AssertionError(f"No matching {kind} event")


def state(ws, predicate=lambda x: True):
    return message(ws, "state", lambda e: predicate(e["room"]))["room"]


@contextmanager
def connect(client, ticket):
    with client.websocket_connect(f"/ws/{ticket['room_id']}", headers=ORIGIN) as ws:
        ws.send_json({"token": ticket["token"]})
        welcome = ws.receive_json()
        assert welcome["type"] == "welcome"
        yield ws


def test_health_and_guest_input(client):
    assert client.get("/health").json() == {"status": "ok", "service": "encore-pool", "protocol": 1}
    assert client.post("/api/rooms", json={"name": "   "}).status_code == 422
    assert client.post("/api/rooms", json={"name": "a" * 33}).status_code == 422
    assert client.post("/api/rooms/missing/join", json={"name": "Guest"}).status_code == 404


def test_room_capacity_and_lock(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        host.send_json({"type": "lock", "value": True})
        assert state(host)["locked"] is True
        assert client.post(f"/api/rooms/{ticket['room_id']}/join", json={"name": "Guest"}).status_code == 403
        host.send_json({"type": "lock", "value": False})
        state(host)
        for i in range(3):
            join(client, ticket, f"Singer {i}")
        assert client.post(f"/api/rooms/{ticket['room_id']}/join", json={"name": "Extra"}).status_code == 409


def test_shared_queue_permissions_and_playback(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        guest_ticket = join(client, ticket)
        with connect(client, guest_ticket) as guest:
            initial = state(guest)
            assert len(initial["members"]) == 2
            assert "token" not in str(initial)
            guest.send_json({"type": "queue_add", "song": {"video_id": "aB9_dE-fGh1", "title": "First"}})
            state(guest, lambda r: r["current"] is not None)
            guest.send_json({"type": "play", "position": 12})
            assert "host" in message(guest, "error")["message"]
            host.send_json({"type": "play", "position": 12})
            playing = state(host, lambda r: r["playing"])
            assert playing["position"] == 12
            assert playing["updated_at"] <= playing["server_time"]
            guest.send_json({"type": "queue_add", "song": {"video_id": "bC0_eF-gHi2", "title": "Second"}})
            queued = state(guest, lambda r: len(r["queue"]) == 1)
            host.send_json({"type": "select", "target": queued["queue"][0]["id"]})
            changed = state(host, lambda r: r["current"]["title"] == "Second")
            assert changed["queue"] == []
            assert changed["position"] == 0
            host.send_json({"type": "pause", "position": 18})
            paused = state(host, lambda r: not r["playing"] and r["position"] == 18)
            assert paused["current"]["title"] == "Second"


def test_modes_moderation_and_signaling(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        guest_ticket = join(client, ticket)
        with connect(client, guest_ticket) as guest:
            state(guest)
            host.send_json({"type": "mode", "mode": "solo"})
            state(guest, lambda r: r["mode"] == "solo")
            guest.send_json({"type": "self_mute", "value": False})
            message(guest, "error")
            host.send_json({"type": "singers", "ids": [guest_ticket["member_id"]]})
            state(guest, lambda r: r["singers"] == [guest_ticket["member_id"]])
            guest.send_json({"type": "self_mute", "value": False})
            state(guest, lambda r: any(m["id"] == guest_ticket["member_id"] and not m["muted"] for m in r["members"]))
            host.send_json({"type": "mute", "target": guest_ticket["member_id"], "value": True})
            state(guest, lambda r: any(m["forced_muted"] for m in r["members"]))
            guest.send_json({"type": "self_mute", "value": False})
            message(guest, "error")
            guest.send_json({"type": "signal", "target": ticket["member_id"], "data": {"description": {"type": "offer", "sdp": "test"}}})
            signal = message(host, "signal")
            assert signal["from"] == guest_ticket["member_id"]
            assert signal["data"]["description"]["sdp"] == "test"
            host.send_json({"type": "remove", "target": guest_ticket["member_id"]})
            with pytest.raises(WebSocketDisconnect) as exc:
                while True:
                    guest.receive_json()
            assert exc.value.code == 4003
            assert guest_ticket["member_id"] not in api.rooms[ticket["room_id"]].members


def test_removing_loaded_song_clears_playback_for_everyone(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        guest_ticket = join(client, ticket)
        with connect(client, guest_ticket) as guest:
            state(guest)
            for title in ["Current", "Upcoming", "Keep queued"]:
                host.send_json({"type": "queue_add", "song": {"video_id": "aB9_dE-fGh1", "title": title}})
                state(host, lambda r: r["current"] is not None)
            loaded = state(guest, lambda r: len(r["queue"]) == 2)
            host.send_json({"type": "play", "position": 15})
            state(guest, lambda r: r["playing"])
            host.send_json({"type": "queue_remove", "target": loaded["queue"][0]["id"]})
            remaining = state(guest, lambda r: len(r["queue"]) == 1)
            assert remaining["current"]["id"] == loaded["current"]["id"]
            assert remaining["playing"] is True
            host.send_json({"type": "queue_remove", "target": loaded["current"]["id"]})
            cleared = state(guest, lambda r: r["current"] is None)
            assert cleared["playing"] is False
            assert cleared["position"] == 0
            assert [s["title"] for s in cleared["queue"]] == ["Keep queued"]
            state(host, lambda r: r["current"] is None)
            host.send_json({"type": "select", "target": cleared["queue"][0]["id"]})
            resumed = state(guest, lambda r: r["current"] is not None)
            assert resumed["current"]["title"] == "Keep queued"
            assert resumed["position"] == 0


def test_turn_rotation_leave_transfer_and_end(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        guest_ticket = join(client, ticket)
        with connect(client, guest_ticket) as guest:
            state(guest)
            host.send_json({"type": "mode", "mode": "turn-based"})
            state(host, lambda r: r["mode"] == "turn-based")
            host.send_json({"type": "next"})
            state(guest, lambda r: r["singers"] == [guest_ticket["member_id"]])
            host.send_json({"type": "leave"})
            transferred = state(guest, lambda r: r["host"] == guest_ticket["member_id"])
            assert len(transferred["members"]) == 1
            guest.send_json({"type": "end"})
            with pytest.raises(WebSocketDisconnect) as exc:
                while True:
                    guest.receive_json()
            assert exc.value.code == 4000
            assert ticket["room_id"] not in api.rooms


def test_socket_auth_origin_and_reconnect(client):
    ticket = create(client)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/{ticket['room_id']}", headers={"origin": "https://untrusted.test"}):
            pass
    for invalid in ["wrong", "\u00e9" * 43]:
        with client.websocket_connect(f"/ws/{ticket['room_id']}", headers=ORIGIN) as ws:
            ws.send_json({"token": invalid})
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
            assert exc.value.code == 4003
    with connect(client, ticket) as first:
        original = state(first)
        with connect(client, ticket) as second:
            restored = state(second)
            assert restored["host"] == original["host"]
            assert len(restored["members"]) == 1
            with pytest.raises(WebSocketDisconnect) as exc:
                first.receive_json()
            assert exc.value.code == 4001
            second.send_json({"type": "ping"})
            assert message(second, "pong")["server_time"] <= time.time()


def test_invalid_commands_do_not_crash_room(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        for command in [{"type": "queue_add"}, {"type": "seek", "position": -1}, {"type": "not-real"}, {"type": "mode", "mode": "invalid"}, {"type": "queue_add", "song": {"video_id": "bad", "title": "bad"}}]:
            host.send_json(command)
            message(host, "error")
        host.send_json({"type": "ping"})
        message(host, "pong")


def test_all_host_controls_reject_guest_commands(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        guest_ticket = join(client, ticket)
        with connect(client, guest_ticket) as guest:
            state(guest)
            for action in api.HOST_ACTIONS:
                guest.send_json({"type": action})
                assert "host" in message(guest, "error")["message"]


def test_admission_rate_limit_and_queue_cap(client):
    ticket = create(client)
    with connect(client, ticket) as host:
        state(host)
        song = {"video_id": "aB9_dE-fGh1", "title": "Track"}
        for i in range(51):
            host.send_json({"type": "queue_add", "song": song})
            state(host)
        host.send_json({"type": "queue_add", "song": song})
        assert "full" in message(host, "error")["message"]
    for _ in range(29):
        assert client.post("/api/rooms", json={"name": "Host"}).status_code == 201
    assert client.post("/api/rooms", json={"name": "Host"}).status_code == 429


def test_expiry_cleanup_and_short_lived_turn_credentials(client, monkeypatch):
    ticket = create(client)
    room = api.rooms[ticket["room_id"]]
    room.members[ticket["member_id"]].last_seen -= api.RECONNECT_SECONDS + 1
    client.portal.call(api.sweep)
    assert ticket["room_id"] not in api.rooms
    ticket = create(client)
    api.rooms[ticket["room_id"]].created_at -= api.ROOM_TTL + 1
    assert client.post(f"/api/rooms/{ticket['room_id']}/join", json={"name": "Late"}).status_code == 404
    client.portal.call(api.sweep)
    assert ticket["room_id"] not in api.rooms
    monkeypatch.setenv("TURN_SECRET", "test-secret")
    monkeypatch.setenv("TURN_URLS", "turn:relay.test:3478")
    ice = api.ice_servers("singer")
    assert ice[1]["urls"] == ["turn:relay.test:3478"]
    assert ice[1]["username"].endswith(":singer")
    assert int(ice[1]["username"].split(":")[0]) > time.time()
    assert "test-secret" not in str(ice)
