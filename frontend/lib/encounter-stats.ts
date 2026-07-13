const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface EncounterStat {
  encounter_id: string;
  encounter_name?: string;
  room_type?: string;
  act?: number | string;
  total: number;
  fatal: number;
  avg_damage: number;
  avg_turns: number;
}

/**
 * Community "how deadly is this fight" numbers for a monster's encounters, so
 * the kill rate / avg damage / avg turns render into the SSR HTML — unique data
 * no wiki has. Sourced from /api/runs/encounter-stats (top ~200 encounters by
 * volume, which covers the notable monsters). Next dedupes the fetch across all
 * monster pages. Returns [] for encounters outside the top set, so the section
 * just hides for rarely-fought monsters.
 */
export async function fetchEncounterStats(
  encounterIds: string[],
): Promise<EncounterStat[]> {
  if (!encounterIds?.length) return [];
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/encounter-stats?limit=200`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { encounters?: EncounterStat[] };
    // The endpoint can return several rows for one encounter_id (tiny beta /
    // edge slices alongside the real aggregate). Keep the highest-volume row so
    // a stray "2 runs, 0 damage" slice never masks the true numbers.
    const byId = new Map<string, EncounterStat>();
    for (const r of data.encounters ?? []) {
      const prev = byId.get(r.encounter_id);
      if (!prev || r.total > prev.total) byId.set(r.encounter_id, r);
    }
    return encounterIds
      .map((id) => byId.get(id))
      .filter((x): x is EncounterStat => !!x && x.total > 0);
  } catch {
    return [];
  }
}
