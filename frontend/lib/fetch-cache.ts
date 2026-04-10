/**
 * Simple in-memory fetch cache for API responses.
 * Keyed by URL — identical requests return cached data instantly.
 * Cache lives for the browser session (cleared on page reload).
 */

const cache = new Map<string, { data: unknown; timestamp: number }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

// Beta version — set by BetaVersionContext, read by cachedFetch
let _betaVersion: string | null = null;

export function setBetaVersion(v: string | null) {
  _betaVersion = v;
}

export function getBetaVersion(): string | null {
  return _betaVersion;
}

export function buildApiUrl(url: string): string {
  if (_betaVersion) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}version=${_betaVersion}`;
  }
  return url;
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
