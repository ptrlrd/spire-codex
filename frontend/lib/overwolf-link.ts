const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const KEY = "spire-codex:overwolf-link";
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

export type OverwolfTier = "common" | "rare" | "ancient";

export interface OverwolfLinkResult {
  tier: OverwolfTier | null;
  adFree: boolean;
}

export class OverwolfLinkError extends Error {
  status: number;

  constructor(status: number, detail?: string) {
    super(`${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
  }
}

export function overwolfIdFromToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    const sub = claims?.sub;
    return typeof sub === "string" && sub.trim() ? sub.trim() : null;
  } catch {
    return null;
  }
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
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new OverwolfLinkError(
      res.status,
      typeof body?.detail === "string" ? body.detail : undefined,
    );
  }
  const data = await res.json();
  return { tier: data.tier ?? null, adFree: Boolean(data.ad_free) };
}
