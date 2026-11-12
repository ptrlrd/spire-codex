// Filter values that are their own canonical tier-list pages. The pages
// render the pills from these lists and the sitemap lists the same URLs, so
// adding a value here is the whole change.
export const TIER_CARD_COLORS = [
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
  "fool",
  "colorless",
] as const;
export const TIER_RELIC_POOLS = [
  "shared",
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
  "fool",
] as const;
export const TIER_RELIC_ANCIENTS = [
  "neow",
  "tezcatara",
  "pael",
  "orobas",
  "darv",
  "nonupeipe",
  "tanx",
  "vakuu",
] as const;
export const TIER_RELIC_ACTS = ["1", "2", "3"] as const;

const RELIC_TIER_LIST = "/tier-list/relics";

function oneOf<T extends string>(
  list: readonly T[],
  raw: string | undefined | null,
): T | "" {
  const v = (raw ?? "").toLowerCase();
  return (list as readonly string[]).includes(v) ? (v as T) : "";
}

/** The indexable URL a relic tier list view belongs to. An ancient's pool wins over the character pool, an act view wins over the character pool, and nothing else (bracket, rarity) is ever part of it. */
export function relicTierListCanonical(filters: {
  pool?: string | null;
  act?: string | null;
  ancient?: string | null;
}): string {
  const ancient = oneOf(TIER_RELIC_ANCIENTS, filters.ancient);
  const act = oneOf(TIER_RELIC_ACTS, filters.act);
  const pool = oneOf(TIER_RELIC_POOLS, filters.pool);
  const params = new URLSearchParams();
  if (ancient) {
    if (act) params.set("act", act);
    params.set("ancient", ancient);
  } else if (act) {
    params.set("act", act);
  } else if (pool) {
    params.set("pool", pool);
  }
  const qs = params.toString();
  return qs ? `${RELIC_TIER_LIST}?${qs}` : RELIC_TIER_LIST;
}

export function cardTierListCanonical(color?: string | null): string {
  const c = oneOf(TIER_CARD_COLORS, color);
  return c ? `/tier-list/cards?color=${c}` : "/tier-list/cards";
}

export function tierListVariantPaths(): { path: string; priority: number }[] {
  return [
    ...TIER_CARD_COLORS.map((c) => ({
      path: cardTierListCanonical(c),
      priority: 0.8,
    })),
    ...TIER_RELIC_POOLS.map((pool) => ({
      path: relicTierListCanonical({ pool }),
      priority: 0.8,
    })),
    ...TIER_RELIC_ACTS.map((act) => ({
      path: relicTierListCanonical({ act }),
      priority: 0.7,
    })),
    ...TIER_RELIC_ANCIENTS.map((ancient) => ({
      path: relicTierListCanonical({ ancient }),
      priority: 0.8,
    })),
    ...TIER_RELIC_ACTS.flatMap((act) =>
      TIER_RELIC_ANCIENTS.map((ancient) => ({
        path: relicTierListCanonical({ act, ancient }),
        priority: 0.6,
      })),
    ),
  ];
}
