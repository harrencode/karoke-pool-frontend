import type { PoolTicket } from "./pool-types";

export const POOL_UNAVAILABLE = "Karaoke Pool party is not available right now. You can still use Solo karaoke.";
export class PoolUnavailable extends Error { constructor() { super(POOL_UNAVAILABLE); this.name = "PoolUnavailable"; } }

// Called only from the Pool route. Solo never imports or contacts this service.
export function poolApiBase() {
  const configured = process.env.NEXT_PUBLIC_POOL_API_URL?.trim().replace(/\/$/, "");
  if (configured) {
    try {
      const url = new URL(configured, typeof window !== "undefined" ? window.location.origin : undefined);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return "";
      return url.href.replace(/\/$/, "");
    } catch { return ""; }
  }
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) return `http://${window.location.hostname}:8000`;
  return "";
}
export async function poolRequest<T>(base: string, path: string, body?: unknown): Promise<T> {
  if (!base) throw new PoolUnavailable();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${base}${path}`, { signal: controller.signal, cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    if (response.status >= 500) throw new PoolUnavailable();
    let data;
    try { data = await response.json(); } catch { throw new PoolUnavailable(); }
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Check your display name and room invitation.");
    return data as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) throw new PoolUnavailable();
    throw error;
  } finally { clearTimeout(timeout); }
}
export async function checkPool(base: string) {
  const result = await poolRequest<{ status: string; service: string; protocol: number }>(base, "/health");
  if (result.status !== "ok" || result.service !== "encore-pool" || result.protocol !== 1) throw new PoolUnavailable();
}
export function validTicket(value: unknown): value is PoolTicket {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return ["room_id", "member_id", "token"].every(k => typeof t[k] === "string" && /^[\w-]{12,100}$/.test(t[k] as string));
}
export function roomIdFromInput(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{12,64}$/.test(text)) return text;
  try {
    const room = new URL(text).searchParams.get("room");
    return room && /^[\w-]{12,64}$/.test(room) ? room : null;
  } catch { return null; }
}
