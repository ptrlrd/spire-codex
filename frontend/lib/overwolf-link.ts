const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const KEY = "spire-codex:overwolf-link";
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

export type OverwolfTier = "common" | "rare" | "ancient";

export interface OverwolfLinkResult {
  tier: OverwolfTier | null;
  adFree: boolean;
}

export function savePendingOverwolfToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {}
}

export function takePendingOverwolfToken(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw);
    if (typeof token !== "string" || Date.now() - at > TOKEN_LIFETIME_MS)
      return null;
    return token;
  } catch {
    return null;
  }
}

export function hasPendingOverwolfToken(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export async function linkOverwolf(token: string): Promise<OverwolfLinkResult> {
  const res = await fetch(`${API_BASE}/api/auth/overwolf/link`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return { tier: data.tier ?? null, adFree: Boolean(data.ad_free) };
}
