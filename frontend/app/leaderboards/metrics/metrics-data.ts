import type { MetricRow } from "./MetricsClient";

const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FETCH_TTL = 300;

interface ApiCard {
  id: string;
  name: string;
  color: string;
  type: string;
  rarity: string;
  image_url: string | null;
}

interface ApiMetricRow {
  id: string;
  upgraded?: boolean;
  score: number | null;
  tier: string | null;
  elo: number | null;
  win_rate: number | null;
  pick_rate: number | null;
  picks: number;
  wins: number;
  losses: number;
  offered: number;
  picked: number;
  pick_rate_by_act: (number | null)[];
}

interface MetricsResponse {
  entity_type: string;
  baseline_win_rate: number;
  total_runs: number;
  rows: ApiMetricRow[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: FETCH_TTL } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Run brackets the page can slice by. Keep in sync with _BRACKET_KEYS in
// run_entity_stats.py. "all" is the default and omits the query param.
export const BRACKETS = [
  { key: "all", label: "All runs" },
  { key: "solo", label: "Solo" },
  { key: "2p", label: "2P" },
  { key: "3p", label: "3P" },
  { key: "4p", label: "4P" },
  { key: "a10", label: "A10" },
  { key: "daily", label: "Daily" },
  { key: "custom", label: "Custom" },
  // Win-rate skill brackets (A10-gated quality ladder). Mirror _BRACKET_KEYS.
  { key: "wr30", label: "A10 >30% WR" },
  { key: "wr50", label: "A10 >50% WR" },
  { key: "wr75", label: "A10 >75% WR" },
] as const;

// The metrics page lets you combine a player count with a skill tier, which the
// backend serves as a "player:skill" composite bracket (e.g. solo:wr50). Accept
// those in addition to the single brackets above.
const _PLAYER_KEYS = ["solo", "2p", "3p", "4p"];
const _SKILL_KEYS = ["a10", "wr30", "wr50", "wr75"];
function isValidBracket(b: string): boolean {
  if (BRACKETS.some((c) => c.key === b)) return true;
  const [p, s] = b.split(":");
  return _PLAYER_KEYS.includes(p) && _SKILL_KEYS.includes(s);
}

// Fetch + join the metrics table with card metadata. Shared by the base
// /leaderboards/metrics page and the localized /[lang] variant so both render
// server-side (one in-memory join, no client round trips). `lang` only affects
// card names; the metrics themselves are language-agnostic.
export async function loadMetrics(
  lang = "eng",
  bracket = "all"
): Promise<{
  rows: MetricRow[];
  baselineWinRate: number;
  totalRuns: number;
  bracket: string;
}> {
  const valid = isValidBracket(bracket) ? bracket : "all";
  const [cards, metrics] = await Promise.all([
    fetchJson<ApiCard[]>(`${API_INTERNAL}/api/cards?lang=${lang}`),
    fetchJson<MetricsResponse>(
      `${API_INTERNAL}/api/runs/metrics/cards?bracket=${valid}`
    ),
  ]);

  // Drop rows with no card entry (tokens/internal ids) to keep it clean.
  const byId = new Map<string, ApiCard>();
  for (const c of cards || []) byId.set(c.id.toUpperCase(), c);

  const rows: MetricRow[] = [];
  for (const m of metrics?.rows || []) {
    const c = byId.get(m.id.toUpperCase());
    if (!c) continue;
    rows.push({
      id: m.id,
      upgraded: !!m.upgraded,
      name: m.upgraded ? `${c.name}+` : c.name,
      color: c.color,
      type: c.type,
      rarity: c.rarity,
      imageUrl: c.image_url,
      score: m.score,
      tier: m.tier,
      elo: m.elo,
      winRate: m.win_rate,
      pickRate: m.pick_rate,
      picks: m.picks,
      wins: m.wins,
      losses: m.losses,
      offered: m.offered,
      picked: m.picked,
      pickByAct: m.pick_rate_by_act || [null, null, null],
    });
  }
  return {
    rows,
    baselineWinRate: metrics?.baseline_win_rate ?? 0,
    totalRuns: metrics?.total_runs ?? 0,
    bracket: valid,
  };
}
