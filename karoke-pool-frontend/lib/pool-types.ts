import type { Song } from "./types";

export type Mode = "solo" | "duet" | "group" | "turn-based";
export type PoolMember = { id: string; name: string; muted: boolean; forced_muted: boolean; connected: boolean };
export type PoolRoom = { id: string; host: string; members: PoolMember[]; queue: (Song & { added_by: string })[]; current: Song | null; playing: boolean; position: number; updated_at: number; server_time: number; mode: Mode; singers: string[]; locked: boolean; revision: number };
export type PoolTicket = { room_id: string; member_id: string; token: string };
export type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
export type PoolCommand = { type: string; target?: string; song?: { video_id: string; title: string }; position?: number; value?: boolean; mode?: Mode; ids?: string[]; data?: Signal };
export function canSing(room: PoolRoom, id: string) {
  const member = room.members.find(m => m.id === id);
  return Boolean(member?.connected && !member.forced_muted && (room.mode === "group" || room.singers.includes(id)));
}
