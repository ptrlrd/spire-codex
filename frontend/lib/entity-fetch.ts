// fetch() wrapper for entity detail SSR. Only a definitive 404 or 410 (gone
// for good, which is the same answer) may be read as "this entity doesn't
// exist"; every other non-OK status (a 429
// from the rate limiter, a 5xx, an auth error) throws so the page fails the
// render instead of redirecting a valid URL to its hub. Google records a
// hub redirect as a Soft 404 and drops the URL, which is what happened to
// localized entity pages while server-side fetches shared one rate-limit
// bucket (2026-09).
//
// A 404 for an id the current beta adds falls through to the beta channel,
// so beta-only content renders on the main URL. The response then carries
// the beta version in a header for the page to read (betaOnlyVersion). A
// failing diff or beta fetch throws like any other API failure, so a sick
// backend never turns a beta-only page into a cached not-found.

export const BETA_VERSION_HEADER = "x-codex-beta-version";

const ENTITY_URL = /\/api\/([a-z-]+)\/([^/?#]+)(?:[?#]|$)/;

interface BetaDiff {
  beta_version: string | null;
  types?: Record<string, { added?: string[] }>;
}

async function betaAddition(url: string): Promise<string | null> {
  const m = url.match(ENTITY_URL);
  if (!m) return null;
  const [, type, rawId] = m;
  const res = await fetch(`${new URL(url).origin}/api/beta/diff`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`beta diff API ${res.status} for ${url}`);
  const diff = (await res.json()) as BetaDiff;
  if (!diff.beta_version) return null;
  const id = decodeURIComponent(rawId).toUpperCase();
  return diff.types?.[type]?.added?.includes(id) ? diff.beta_version : null;
}

function withChannel(url: string): string {
  if (/[?&]channel=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}channel=beta`;
}

export async function fetchEntityRes(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`entity API ${res.status} for ${url}`);
  }
  if (res.status !== 404) return res;
  const version = await betaAddition(url);
  if (!version) return res;
  const beta = await fetch(withChannel(url), init);
  if (beta.status === 404) return res;
  if (!beta.ok) throw new Error(`entity API ${beta.status} for ${url}`);
  const headers = new Headers(beta.headers);
  headers.set(BETA_VERSION_HEADER, version);
  return new Response(beta.body, { status: beta.status, headers });
}

/** The beta version when the response came from the beta fallback. */
export function betaOnlyVersion(res: Response): string | null {
  return res.headers.get(BETA_VERSION_HEADER);
}
