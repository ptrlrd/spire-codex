import type {
  BracketStat,
  EntityOfferStats,
  EntityStats,
} from "@/app/components/EntityRunStats";
import {
  bracketParam,
  combineBracket,
  splitBracket,
} from "@/lib/content-brackets";

export const SMALL_SAMPLE_ROWS = 5;

export interface ResolvedBracket {
  key: string;
  block: BracketStat | null;
  requested: string | null;
}

export function resolveBracket(
  stats: Pick<EntityStats, "brackets">,
  selected: string,
): ResolvedBracket {
  const brackets = stats.brackets ?? {};
  const { skill, version } = splitBracket(selected);
  for (const key of [selected, combineBracket("", skill, version), "all"]) {
    if (brackets[key])
      return {
        key,
        block: brackets[key],
        requested: key === selected ? null : selected,
      };
  }
  return {
    key: "all",
    block: null,
    requested: selected === "all" ? null : selected,
  };
}

export function metricsUrl(
  api: string,
  entityType: string,
  bracket: string,
): string {
  return `${api}/api/runs/metrics/${entityType}?bracket=${bracketParam(bracket) ?? "all"}`;
}

interface MetricsRow {
  id?: string;
  upgraded?: boolean;
  pick_rate?: number | null;
  pick_rate_by_act?: (number | null)[];
  offered?: number | null;
  picked?: number | null;
}

export interface MetricsTable {
  baseline_win_rate?: number | null;
  data_through?: string | null;
  rows?: MetricsRow[];
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export function offerStatsFrom(
  table: MetricsTable | null | undefined,
  entityId: string,
  bracket: string,
): EntityOfferStats | null {
  if (!table) return null;
  const id = entityId.toUpperCase();
  const row = (table.rows || []).find(
    (r) => (r.id || "").toUpperCase() === id && !r.upgraded,
  );
  return {
    bracket,
    baseline_win_rate: num(table.baseline_win_rate),
    data_through: table.data_through ?? null,
    pick_rate: num(row?.pick_rate),
    pick_rate_by_act: (row?.pick_rate_by_act ?? []).map(num),
    offered: num(row?.offered),
    picked: num(row?.picked),
  };
}

export function bracketBaseline(
  stats: EntityStats,
  resolved: ResolvedBracket,
): number | null {
  const own = resolved.block?.baseline_win_rate;
  if (typeof own === "number") return own;
  if (
    stats.metrics?.bracket === resolved.key &&
    stats.metrics.baseline_win_rate !== null
  )
    return stats.metrics.baseline_win_rate;
  return resolved.key === "all" ? stats.baseline_win_rate : null;
}
