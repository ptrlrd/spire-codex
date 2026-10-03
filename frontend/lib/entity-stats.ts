import type { EntityStats } from "@/app/components/EntityRunStats";
import { DEFAULT_SOLO_BRACKET } from "@/lib/content-brackets";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

/**
 * Server-side fetch of an entity's community run stats, so the numbers (win
 * rate, pick rate, Codex Score, tier, per-character) render into the initial
 * SSR HTML instead of a client-only "Loading" placeholder — the whole point
 * being that this is unique data crawlers should see.
 *
 * Returns null on any error or for entities with no runs yet (the endpoint
 * hands back a zero-filled stub in that case). A null just falls back to the
 * existing client-only behaviour, since EntityRunStats still re-fetches on
 * mount for freshness.
 */
export async function fetchEntityStats(
  entityType: "relics" | "cards" | "potions",
  entityId: string,
): Promise<EntityStats | null> {
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/runs/stats/${entityType}/${entityId}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const stats = (await res.json()) as EntityStats;
    if (!stats || !(stats.picks > 0)) return null;
    const row = await fetchMetricsRow(entityType, entityId);
    return {
      ...stats,
      lift: row?.lift ?? null,
      lift_n: row?.lift_n ?? null,
      hold_rate: row?.hold_rate ?? null,
    };
  } catch {
    return null;
  }
}

interface MetricsRow {
  id: string;
  upgraded?: boolean;
  lift?: number | null;
  lift_n?: number | null;
  hold_rate?: number | null;
}

async function fetchMetricsRow(
  entityType: "relics" | "cards" | "potions",
  entityId: string,
): Promise<MetricsRow | null> {
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/runs/metrics/${entityType}?bracket=${DEFAULT_SOLO_BRACKET}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rows?: MetricsRow[] };
    const id = entityId.toUpperCase();
    return (
      (data.rows || []).find(
        (r) => (r.id || "").toUpperCase() === id && !r.upgraded,
      ) ?? null
    );
  } catch {
    return null;
  }
}
