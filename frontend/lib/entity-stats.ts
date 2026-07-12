import type { EntityStats } from "@/app/components/EntityRunStats";

const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    return stats && stats.picks > 0 ? stats : null;
  } catch {
    return null;
  }
}
