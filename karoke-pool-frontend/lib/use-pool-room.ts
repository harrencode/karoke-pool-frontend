"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceMesh } from "./voice-mesh";
import type { PoolCommand, PoolRoom, PoolTicket, Signal } from "./pool-types";
import { POOL_UNAVAILABLE } from "./pool-api";

export function usePoolRoom(base: string, ticket: PoolTicket | null, stream: MediaStream | null) {
  const [room, setRoom] = useState<PoolRoom | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "unavailable" | "ended">("connecting");
  const [message, setMessage] = useState("");
  const [clockOffset, setClockOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const mesh = useRef<VoiceMesh | null>(null);
  const currentStream = useRef(stream); currentStream.current = stream;
  const currentRoom = useRef<PoolRoom | null>(null);
  const volumes = useRef(new Map<string, number>());
  const send = useCallback((command: PoolCommand) => {
    if (socket.current?.readyState !== WebSocket.OPEN) { setMessage(POOL_UNAVAILABLE); return false; }
    socket.current.send(JSON.stringify(command)); return true;
  }, []);

  useEffect(() => {
    if (!ticket) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let watchdog: ReturnType<typeof setTimeout>;
    let disconnectedAt = Date.now();
    let tries = 0;
    let pingAt = 0;
    let lastPong = Date.now();
    currentRoom.current = null; setRoom(null); setMessage(""); setStatus("connecting");
    function connect() {
      if (disposed) return;
      const url = new URL(base); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/${ticket!.room_id}`;
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { setStatus("unavailable"); setMessage(POOL_UNAVAILABLE); return; }
      socket.current = ws;
      const lost = (code: number, reason: string) => {
        if (disposed || socket.current !== ws) return;
        clearTimeout(watchdog); clearInterval(heartbeat);
        mesh.current?.close(); mesh.current = null; socket.current = null;
        if ([4000, 4001, 4003, 4004, 1008].includes(code)) {
          setStatus("ended"); setMessage(reason || "This room has ended. You can continue with Solo karaoke."); return;
        }
        currentRoom.current = null;
        setMessage(POOL_UNAVAILABLE);
        if (!disconnectedAt) disconnectedAt = Date.now();
        if (Date.now() - disconnectedAt > 25000) { setStatus("unavailable"); return; }
        setStatus("reconnecting");
        retry = setTimeout(connect, Math.min(1000 * 2 ** tries++, 5000));
      };
      watchdog = setTimeout(() => { ws.close(); lost(1006, ""); }, 6000);
      ws.onopen = () => { ws.send(JSON.stringify({ token: ticket!.token })); };
      ws.onmessage = event => {
        if (disposed || socket.current !== ws) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "welcome") {
            clearTimeout(watchdog);
            mesh.current?.close();
            if (typeof RTCPeerConnection !== "undefined") {
              const voice = new VoiceMesh(ticket!.member_id, data.ice_servers, (id, signal) => send({ type: "signal", target: id, data: signal }), setMessage);
              mesh.current = voice; voice.setStream(currentStream.current);
              volumes.current.forEach((v, id) => voice.setVolume(id, v));
            } else setMessage("Your browser cannot send room voice. You can still follow the music.");
            pingAt = Date.now(); lastPong = pingAt; ws.send(JSON.stringify({ type: "ping" }));
            heartbeat = setInterval(() => {
              if (Date.now() - lastPong > 25000) { ws.close(); lost(1006, ""); return; }
              if (ws.readyState === WebSocket.OPEN) { pingAt = Date.now(); ws.send(JSON.stringify({ type: "ping" })); }
            }, 10000);
          } else if (data.type === "state") {
            const next = data.room as PoolRoom;
            if (next.id !== ticket!.room_id || (currentRoom.current && next.revision < currentRoom.current.revision)) return;
            if (!currentRoom.current) setClockOffset(next.server_time * 1000 - Date.now());
            currentRoom.current = next; setRoom(next);
            setStatus("connected"); tries = 0; disconnectedAt = 0;
            try { mesh.current?.reconcile(next); } catch { setMessage("Room voice is unavailable in this browser. You can still follow the music."); }
          } else if (data.type === "pong") {
            lastPong = Date.now(); setClockOffset(data.server_time * 1000 - (pingAt + lastPong) / 2);
            if (data.ice_servers) mesh.current?.updateIce(data.ice_servers);
          } else if (data.type === "signal") {
            if (currentRoom.current?.members.some(m => m.id === data.from && m.connected)) mesh.current?.signal(data.from, data.data as Signal);
          } else if (data.type === "error") setMessage(data.message);
        } catch { setMessage("The room sent an invalid update. Try reconnecting."); }
      };
      ws.onerror = () => { /* onclose owns recovery; solo is always available. */ };
      ws.onclose = event => lost(event.code, event.reason);
    }
    connect();
    return () => {
      disposed = true; clearTimeout(retry); clearTimeout(watchdog); clearInterval(heartbeat);
      mesh.current?.close(); mesh.current = null;
      const ws = socket.current; socket.current = null; ws?.close();
    };
  }, [base, ticket, attempt, send]);
  useEffect(() => { mesh.current?.setStream(stream); }, [stream]);
  const reconnect = useCallback(() => setAttempt(n => n + 1), []);
  const enableAudio = useCallback(() => mesh.current?.resume(), []);
  const setVolume = useCallback((id: string, value: number) => { volumes.current.set(id, value); mesh.current?.setVolume(id, value); }, []);
  return { room, status, message, setMessage, clockOffset, send, reconnect, enableAudio, setVolume };
}
