// Filter values that are their own canonical tier-list pages. The pages
// render the pills from these lists and the sitemap lists the same URLs, so
// adding a value here is the whole change.
export const TIER_CARD_COLORS = ["ironclad", "silent", "defect", "necrobinder", "regent", "colorless"] as const;
export const TIER_RELIC_POOLS = ["shared", "ironclad", "silent", "defect", "necrobinder", "regent"] as const;
export const TIER_RELIC_ANCIENTS = ["neow", "tezcatara", "pael", "orobas", "darv", "nonupeipe", "tanx", "vakuu"] as const;
export const TIER_RELIC_ACTS = ["1", "2", "3"] as const;
