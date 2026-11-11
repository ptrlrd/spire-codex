"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BATCH = 100;

const cache = new Map<string, boolean>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getVersion(): number {
  return version;
}

function getServerVersion(): number {
  return -1;
}

function keyOf(name: string | null | undefined): string | null {
  const k = (name ?? "").trim().toLowerCase();
  return k ? k : null;
}

async function load(keys: string[]): Promise<void> {
  const qs = keys.map((k) => `u=${encodeURIComponent(k)}`).join("&");
  try {
    const res = await fetch(`${API_BASE}/api/players/profiles?${qs}`);
    const data = res.ok
      ? ((await res.json()) as { profiles?: string[] })
      : { profiles: [] };
    const found = new Set(data.profiles ?? []);
    for (const k of keys) cache.set(k, found.has(k));
  } catch {
    for (const k of keys) cache.set(k, false);
  }
  notify();
}

function flush() {
  flushTimer = null;
  const keys = Array.from(pending);
  pending.clear();
  for (let i = 0; i < keys.length; i += BATCH) {
    void load(keys.slice(i, i + BATCH));
  }
}

function request(key: string): void {
  if (cache.has(key) || pending.has(key)) return;
  pending.add(key);
  if (flushTimer === null) flushTimer = setTimeout(flush, 0);
}

export function resetPlayerPages(): void {
  cache.clear();
  pending.clear();
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
}

export function useHasPlayerPage(name: string | null | undefined): boolean {
  const key = keyOf(name);
  const seen = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  useEffect(() => {
    if (key) request(key);
  }, [key]);
  return useMemo(
    () => seen >= 0 && !!key && cache.get(key) === true,
    [key, seen],
  );
}

export function playerPageHref(username: string): string {
  return `/players/${encodeURIComponent(username)}`;
}

export function playerRunsHref(bp: string, username: string): string {
  return `${bp}/runs?username=${encodeURIComponent(username)}`;
}
