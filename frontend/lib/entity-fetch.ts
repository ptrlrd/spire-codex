// fetch() wrapper for entity detail SSR. Only a definitive 404 or 410 (gone
// for good, which is the same answer) may be read as "this entity doesn't
// exist"; every other non-OK status (a 429
// from the rate limiter, a 5xx, an auth error) throws so the page fails the
// render instead of redirecting a valid URL to its hub. Google records a
// hub redirect as a Soft 404 and drops the URL, which is what happened to
// localized entity pages while server-side fetches shared one rate-limit
// bucket (2026-09).
export async function fetchEntityRes(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`entity API ${res.status} for ${url}`);
  }
  return res;
}
