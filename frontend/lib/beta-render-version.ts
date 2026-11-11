export const BETA_RENDER_VERSION_FALLBACK = "0.111.0";

export function normalizeBetaRenderVersion(
  v: string | null | undefined,
): string | null {
  if (typeof v !== "string") return null;
  const out = v
    .trim()
    .replace(/^v/, "")
    .replace(/-beta$/, "");
  return /^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(out) ? out : null;
}

let current: string | null = null;
const listeners = new Set<() => void>();

export function subscribeBetaRenderVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function peekBetaRenderVersion(): string | null {
  return current;
}

export function getBetaRenderVersion(): string {
  return current ?? BETA_RENDER_VERSION_FALLBACK;
}

export function setBetaRenderVersion(v: string | null | undefined): void {
  const next = normalizeBetaRenderVersion(v);
  if (!next || next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function seedBetaRenderVersion(v: string | null | undefined): void {
  if (current === null) setBetaRenderVersion(v);
}

export function resetBetaRenderVersionForTests(): void {
  current = null;
  listeners.clear();
}
