import { useSyncExternalStore } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_MS = 60_000;

export async function fetchPresenceCount(): Promise<number | null> {
  const r = await fetch(`${API}/api/presence/active`);
  if (!r.ok) return null;
  const d = await r.json();
  return typeof d.count === "number" ? d.count : (d.players?.length ?? 0);
}

let count = 0;
let busy = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

async function poll() {
  if (busy || document.hidden) return;
  busy = true;
  const n = await fetchPresenceCount().catch(() => null);
  busy = false;
  if (n !== null && n !== count) {
    count = n;
    for (const notify of listeners) notify();
  }
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) {
    poll();
    timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", poll);
    }
  };
}

/** Players online right now, from one poll shared by every mounted reader. */
export function usePresenceCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => count,
    () => 0,
  );
}
