import type { EntityStats } from "@/app/components/EntityRunStats";
import { DEFAULT_SOLO_BRACKET } from "@/lib/content-brackets";
import {
  metricsUrl,
  offerStatsFrom,
  resolveBracket,
  type MetricsTable,
} from "@/lib/entity-cohort";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

/**
 * Server-side fetch of an entity's community run stats, so the numbers (win
 * rate, hold rate, Codex Score, tier, per-character) render into the initial
 * SSR HTML instead of a client-only "Loading" placeholder.
 *
 * Returns null on any error or for entities with no runs yet (the endpoint
 * hands back a zero-filled stub in that case). The metrics table of the
 * cohort the page opens on rides along as `metrics`: its baseline, the
 * pick-when-offered rate and the data-through time.
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
    const { key } = resolveBracket(stats, DEFAULT_SOLO_BRACKET);
    return {
      ...stats,
      metrics: offerStatsFrom(
        await fetchMetricsTable(entityType, key),
        entityId,
        key,
      ),
    };
  } catch {
    return null;
  }
}

async function fetchMetricsTable(
  entityType: "relics" | "cards" | "potions",
  bracket: string,
): Promise<MetricsTable | null> {
  try {
    const res = await fetch(metricsUrl(API_INTERNAL, entityType, bracket), {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as MetricsTable;
  } catch {
    return null;
  }
}
