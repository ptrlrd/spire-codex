// Content brackets: the skill/quality filter shown on tier lists and other
// run-derived content. "All" and "Asc 10" map to existing run brackets; the
// win-rate tiers are an A10-gated quality ladder (A10 runs from players above
// that overall win rate). Keep the keys in sync with _BRACKET_KEYS in
// backend/app/services/run_entity_stats.py.
export interface ContentBracket {
  key: string;
  param: string | null; // value sent as ?bracket= to the API; null = all runs
  label: string;
}

export const CONTENT_BRACKETS: ContentBracket[] = [
  { key: "all", param: null, label: "All" },
  { key: "a10", param: "a10", label: "A10" },
  { key: "wr30", param: "wr30", label: "A10 >30% WR" },
  { key: "wr50", param: "wr50", label: "A10 >50% WR" },
  { key: "wr75", param: "wr75", label: "A10 >75% WR" },
];

// Exact player-count brackets. A separate axis from the content/skill brackets
// above (they share the single ?bracket= slot, so they're mutually exclusive),
// kept out of CONTENT_BRACKETS so the content-bracket pill rows and charts don't
// render them. Keys match _run_extra_brackets in run_entity_stats.py.
export const PLAYER_BRACKETS: ContentBracket[] = [
  { key: "solo", param: "solo", label: "Solo" },
  { key: "2p", param: "2p", label: "2P" },
  { key: "3p", param: "3p", label: "3P" },
  { key: "4p", param: "4p", label: "4P" },
];

// Both axes are valid ?bracket= values, so normalizeBracket must recognize them.
const _BY_KEY = new Map(
  [...CONTENT_BRACKETS, ...PLAYER_BRACKETS].map((b) => [b.key, b]),
);

/** Normalize a raw ?bracket= value to a known bracket key ("all" if unknown). */
export function normalizeBracket(raw: string | undefined | null): string {
  return raw && _BY_KEY.has(raw) ? raw : "all";
}

/** The ?bracket= API value for a bracket key (null = all runs, no param). */
export function bracketParam(key: string | undefined | null): string | null {
  return _BY_KEY.get(normalizeBracket(key))?.param ?? null;
}

/**
 * /api/runs/list filters for a bracket, for the run-browse table (which has no
 * precomputed brackets and filters per run instead). Mirrors the bracket
 * definition: the win-rate tiers are A10-gated, so they pin ascension_min=10
 * and add a per-submitter winrate floor (0-100). "All" sends nothing.
 */
export function bracketListParams(key: string | undefined | null): {
  ascension_min?: number;
  winrate_min?: number;
} {
  switch (normalizeBracket(key)) {
    case "a10":
      return { ascension_min: 10 };
    case "wr30":
      return { ascension_min: 10, winrate_min: 30 };
    case "wr50":
      return { ascension_min: 10, winrate_min: 50 };
    case "wr75":
      return { ascension_min: 10, winrate_min: 75 };
    default:
      return {};
  }
}
