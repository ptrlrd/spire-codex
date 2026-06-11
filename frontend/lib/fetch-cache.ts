/**
 * Simple in-memory fetch cache for API responses.
 * Keyed by URL, identical requests return cached data instantly.
 * Cache lives for the browser session (cleared on page reload).
 */

const cache = new Map<string, { data: unknown; timestamp: number }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

// Beta version, set by BetaVersionContext, read by cachedFetch
let _betaVersion: string | null = null;

export function setBetaVersion(v: string | null) {
  _betaVersion = v;
}

export function getBetaVersion(): string | null {
  return _betaVersion;
}

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

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

export function buildApiUrl(url: string): string {
  let out = url;
  if (_betaVersion) {
    const sep = out.includes("?") ? "&" : "?";
    out = `${out}${sep}version=${_betaVersion}`;
  }
  // On a /beta page every API read should come from the beta channel; doing
  // it here makes every cachedFetch caller channel-aware without edits.
  if (pathChannel() === "beta" && out.includes("/api/") && !/[?&]channel=/.test(out)) {
    const sep = out.includes("?") ? "&" : "?";
    out = `${out}${sep}channel=beta`;
  }
  return out;
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
