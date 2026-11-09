export type TierLetter = "S" | "A" | "B" | "C" | "D" | "F";

const RANK_BANDS: [number, TierLetter][] = [
  [0.1, "S"],
  [0.25, "A"],
  [0.5, "B"],
  [0.75, "C"],
  [0.9, "D"],
];

export const MIN_POOL_PICKS = 200;

export function tierForRank(index: number, count: number): TierLetter {
  if (count <= 1) return "S";
  const position = index / (count - 1);
  for (const [limit, letter] of RANK_BANDS) {
    if (position <= limit) return letter;
  }
  return "F";
}

export interface WinRateTier {
  tier: TierLetter;
  value: number;
}

export interface PoolStat {
  win_rate?: number | null;
  picks?: number | null;
}

/** The rate a pool entry is graded on: null below the sample floor. */
export function poolWinRate(
  stat: PoolStat | undefined,
  minPicks = MIN_POOL_PICKS,
): number | null {
  const rate = stat?.win_rate;
  if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
  if ((stat?.picks ?? 0) < minPicks) return null;
  return Math.round(rate * 10) / 10;
}

/**
 * Rank-based tiers for a small pool graded by win rate when chosen: the
 * top of the pool is always S and the bottom always F. Rates are compared
 * at the displayed precision, so tiles showing the same number share the
 * better letter. Ids without a finite rate are left out.
 */
export function rankWinRateTiers(
  ids: string[],
  winRates: Map<string, number | null | undefined>,
): Map<string, WinRateTier> {
  const rated = ids
    .map((id) => ({ id, rate: winRates.get(id) }))
    .filter(
      (e): e is { id: string; rate: number } =>
        typeof e.rate === "number" && Number.isFinite(e.rate),
    )
    .map((e) => ({ id: e.id, rate: Math.round(e.rate * 10) / 10 }))
    .sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
  const out = new Map<string, WinRateTier>();
  let previous: { rate: number; tier: TierLetter } | null = null;
  rated.forEach((entry, index) => {
    const tier =
      previous && previous.rate === entry.rate
        ? previous.tier
        : tierForRank(index, rated.length);
    previous = { rate: entry.rate, tier };
    out.set(entry.id, { tier, value: entry.rate });
  });
  return out;
}

export interface PoolEntity {
  id: string;
  score: number | null;
  tier?: TierLetter | null;
  value?: number | null;
}

/**
 * Grade a whole pool in place: rated entries get a tier and their win rate
 * as the tile value, everything else loses its score so it lands in the
 * Unrated row instead of being banded by Codex Score.
 */
export function gradePool<T extends PoolEntity>(
  entities: T[],
  stats: Record<string, PoolStat | undefined>,
  minPicks = MIN_POOL_PICKS,
): void {
  const tiers = rankWinRateTiers(
    entities.map((e) => e.id),
    new Map(
      entities.map((e) => [
        e.id,
        poolWinRate(stats[e.id.toUpperCase()], minPicks),
      ]),
    ),
  );
  for (const e of entities) {
    const graded = tiers.get(e.id);
    e.tier = graded?.tier ?? null;
    e.value = graded?.value ?? null;
    if (!graded) e.score = null;
  }
}
