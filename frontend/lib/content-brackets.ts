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

const _PLAYER_KEYS = new Set(PLAYER_BRACKETS.map((b) => b.key));
const _SKILL_KEYS = new Set(
  CONTENT_BRACKETS.filter((b) => b.key !== "all").map((b) => b.key),
);

/**
 * A game-version bracket ("v0.107.1"): the snapshot keeps an exclusive
 * per-version slice for every release version, so a version is a valid
 * ?bracket= value on its own (it never composes with player/skill).
 */
export function isVersionBracket(raw: string | undefined | null): boolean {
  return !!raw && /^v\d+(\.\d+)*$/.test(raw);
}

/**
 * A "player:skill" composite (e.g. "solo:wr50") combines a player-count bracket
 * with a content/skill bracket. Only the entity cache (tier list + metrics)
 * materializes these, so BracketFilter offers them only in composite mode.
 */
export function isCompositeBracket(raw: string | undefined | null): boolean {
  if (!raw || !raw.includes(":")) return false;
  const [p, s] = raw.split(":");
  return _PLAYER_KEYS.has(p) && _SKILL_KEYS.has(s);
}

/** Split a bracket value into its player + skill axes. A single bracket maps to
 * whichever axis owns it; "all"/unknown gives both empty. */
export function splitBracket(raw: string | undefined | null): {
  player: string;
  skill: string;
} {
  const b = normalizeBracket(raw);
  if (isCompositeBracket(b)) {
    const [player, skill] = b.split(":");
    return { player, skill };
  }
  if (_PLAYER_KEYS.has(b)) return { player: b, skill: "" };
  if (_SKILL_KEYS.has(b)) return { player: "", skill: b };
  return { player: "", skill: "" };
}

/** Combine a player + skill selection into one ?bracket= value. */
export function combineBracket(player: string, skill: string): string {
  if (player && skill) return `${player}:${skill}`;
  return player || skill || "all";
}

/** Normalize a raw ?bracket= value to a known bracket key or a player:skill
 * composite ("all" if unknown). */
export function normalizeBracket(raw: string | undefined | null): string {
  if (!raw) return "all";
  if (_BY_KEY.has(raw)) return raw;
  if (isCompositeBracket(raw)) return raw;
  if (isVersionBracket(raw)) return raw;
  return "all";
}

/** The ?bracket= API value for a bracket key (null = all runs, no param). A
 * composite passes through unchanged (its API value is the composite itself). */
export function bracketParam(key: string | undefined | null): string | null {
  const n = normalizeBracket(key);
  if (n === "all") return null;
  if (isCompositeBracket(n) || isVersionBracket(n)) return n;
  return _BY_KEY.get(n)?.param ?? null;
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
