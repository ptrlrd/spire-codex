export type TierLetter = "S" | "A" | "B" | "C" | "D" | "F";

const RANK_BANDS: [number, TierLetter][] = [
  [0.1, "S"],
  [0.25, "A"],
  [0.5, "B"],
  [0.75, "C"],
  [0.9, "D"],
];

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

/**
 * Rank-based tiers for a small pool graded by win rate when chosen: the
 * top of the pool is always S and the bottom always F, ties share the
 * better letter. Returns an empty map when fewer than two ids have a rate.
 */
export function rankWinRateTiers(
  ids: string[],
  winRates: Map<string, number | null | undefined>,
): Map<string, WinRateTier> {
  const rated = ids
    .map((id) => ({ id, rate: winRates.get(id) }))
    .filter(
      (e): e is { id: string; rate: number } => typeof e.rate === "number",
    )
    .sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
  const out = new Map<string, WinRateTier>();
  if (rated.length < 2) return out;
  let previous: { rate: number; tier: TierLetter } | null = null;
  rated.forEach((entry, index) => {
    const tier =
      previous && previous.rate === entry.rate
        ? previous.tier
        : tierForRank(index, rated.length);
    previous = { rate: entry.rate, tier };
    out.set(entry.id, { tier, value: Math.round(entry.rate * 10) / 10 });
  });
  return out;
}
