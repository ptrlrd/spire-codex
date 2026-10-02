"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { normalizeTheme } from "./theme-palette";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BATCH = 100;

export interface Flair {
  theme: string;
}

export type FlairMap = Record<string, Flair>;

const cache = new Map<string, Flair | null>();
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

export function flairFor(name: string | null | undefined): Flair | null {
  const k = keyOf(name);
  return k ? (cache.get(k) ?? null) : null;
}

export function primeFlair(entries: FlairMap): void {
  for (const [k, v] of Object.entries(entries)) {
    const theme = normalizeTheme(v?.theme);
    cache.set(k.toLowerCase(), theme ? { theme } : null);
  }
  notify();
}

export function forgetFlair(name: string | null | undefined): void {
  const k = keyOf(name);
  if (k) cache.delete(k);
}

async function load(keys: string[]): Promise<void> {
  const qs = keys.map((k) => `u=${encodeURIComponent(k)}`).join("&");
  try {
    const res = await fetch(`${API_BASE}/api/players/flair?${qs}`);
    const data = res.ok ? ((await res.json()) as FlairMap) : {};
    for (const k of keys) {
      const theme = normalizeTheme(data[k]?.theme);
      cache.set(k, theme ? { theme } : null);
    }
  } catch {
    for (const k of keys) cache.set(k, null);
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

export function requestFlair(names: (string | null | undefined)[]): void {
  let added = false;
  for (const n of names) {
    const k = keyOf(n);
    if (k && !cache.has(k) && !pending.has(k)) {
      pending.add(k);
      added = true;
    }
  }
  if (added && flushTimer === null) flushTimer = setTimeout(flush, 0);
}

export function useFlair(names: (string | null | undefined)[]): FlairMap {
  const key = Array.from(
    new Set(names.map((n) => keyOf(n)).filter((k): k is string => !!k)),
  )
    .sort()
    .join("\u0000");
  const seen = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  useEffect(() => {
    requestFlair(key ? key.split("\u0000") : []);
  }, [key]);
  return useMemo(() => {
    const out: FlairMap = {};
    if (seen < 0) return out;
    for (const k of key ? key.split("\u0000") : []) {
      const f = cache.get(k);
      if (f) out[k] = f;
    }
    return out;
  }, [key, seen]);
}

export function useFlairFor(name: string | null | undefined): Flair | null {
  const map = useFlair([name]);
  const k = keyOf(name);
  return k ? (map[k] ?? null) : null;
}
