/**
 * Simple in-memory fetch cache for API responses.
 * Keyed by URL, identical requests return cached data instantly.
 * Cache lives for the browser session (cleared on page reload).
 */

import { LANG_PREFIXES } from "./languages";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

const LANG_CODES = LANG_PREFIXES;

/** "beta" when the browser is on a /beta path (optionally language-prefixed,
 *  e.g. /jpn/beta/cards). Server-side rendering returns null; server pages
 *  forward the channel from their searchParams instead. */
function pathChannel(): "beta" | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/");
  if (parts[1] === "beta") return "beta";
  if (LANG_CODES.has(parts[1]) && parts[2] === "beta") return "beta";
  return null;
}

function paramKey(param: string): string {
  const eq = param.indexOf("=");
  return eq === -1 ? param : param.slice(0, eq);
}

/** One spelling per API read: on a /beta page a read with no channel comes
 *  from the beta channel, elsewhere the default `channel=stable` is dropped,
 *  and the query is ordered by key so the session cache and the CDN see the
 *  same URL for the same data. */
export function buildApiUrl(url: string): string {
  if (!url.includes("/api/")) return url;
  const q = url.indexOf("?");
  const base = q === -1 ? url : url.slice(0, q);
  let params =
    q === -1
      ? []
      : url
          .slice(q + 1)
          .split("&")
          .filter(Boolean);
  if (pathChannel() === "beta") {
    if (!params.some((p) => paramKey(p) === "channel"))
      params.push("channel=beta");
  } else {
    params = params.filter((p) => p !== "channel=stable");
  }
  const ordered = params
    .map((param, i) => ({ param, key: paramKey(param), i }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i))
    .map((x) => x.param);
  return ordered.length ? `${base}?${ordered.join("&")}` : base;
}

export function clearCache() {
  cache.clear();
  inflight.clear();
}

export async function cachedFetch<T>(url: string): Promise<T> {
  const finalUrl = buildApiUrl(url);
  const now = Date.now();
  const cached = cache.get(finalUrl);
  if (cached && now - cached.timestamp < MAX_AGE) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests to the same URL
  const existing = inflight.get(finalUrl);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetch(finalUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    })
    .then((data) => {
      cache.set(finalUrl, { data, timestamp: Date.now() });
      inflight.delete(finalUrl);
      return data as T;
    })
    .catch((err) => {
      inflight.delete(finalUrl);
      throw err;
    });

  inflight.set(finalUrl, promise);
  return promise;
}
