"use client";

// Shared model for saved charts (chart builder + share pages). The spec is
// the only thing stored server-side; the chart data is re-read live from the
// metrics API wherever the chart renders.

export const CHART_SOURCES = [
  "cards",
  "relics",
  "potions",
  "shops",
  "events",
  "campfires",
] as const;
export type ChartSource = (typeof CHART_SOURCES)[number];

export const CHART_TYPES = ["bar", "scatter", "hbar"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const METRIC_KEYS = [
  "win_rate",
  "lift",
  "elo",
  "pick_rate",
  "hold_rate",
  "picks",
  "score",
  "buy_rate",
  "share",
  "use_rate",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const CHART_CHARACTERS = [
  "IRONCLAD",
  "SILENT",
  "DEFECT",
  "NECROBINDER",
  "REGENT",
] as const;

export interface ChartFilters {
  search?: string;
  group?: string;
  rarity?: string;
  min_sample?: number;
}

export interface SavedChartSpec {
  source: ChartSource;
  bracket: string;
  character: string | null;
  chart: ChartType;
  x: string;
  y: MetricKey;
  filters: ChartFilters;
  top: number;
  sort: "asc" | "desc";
}

export interface SavedChartDoc {
  id: string;
  title: string;
  spec: SavedChartSpec;
  public: boolean;
  created_at: string | null;
  updated_at: string | null;
  views: number;
  owner_name?: string | null;
  owner_view?: boolean;
}

/** Metrics the catalog actually serves per source; the saved spec keeps the
 * full METRIC_KEYS vocabulary, these only drive the builder's pickers. */
export const SOURCE_METRICS: Record<ChartSource, MetricKey[]> = {
  cards: ["elo", "win_rate", "pick_rate", "picks", "score"],
  relics: ["win_rate", "pick_rate", "picks", "score"],
  potions: ["win_rate", "pick_rate", "picks", "score"],
  shops: ["buy_rate", "share", "win_rate"],
  events: ["use_rate", "share", "win_rate"],
  campfires: ["use_rate", "share", "win_rate"],
};

/** Row the metrics API serves (only some keys per entity type; missing
 * metrics read as null and render as an em dash). */
export interface MetricRow {
  id: string;
  name?: string;
  color?: string | null;
  rarity?: string | null;
  group?: string | null;
  entity_type?: string | null;
  upgraded?: boolean;
  win_rate?: number | null;
  elo?: number | null;
  pick_rate?: number | null;
  hold_rate?: number | null;
  lift?: number | null;
  picks?: number | null;
  score?: number | null;
  buy_rate?: number | null;
  share?: number | null;
  use_rate?: number | null;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Name lookup per source: catalog endpoints for cards/relics/potions/events
 * (joined by id like the metrics page); shops and campfires fall back to the
 * row's own name field or the raw id. */
export async function fetchNameMap(
  source: ChartSource,
): Promise<Record<string, MetricRow>> {
  const catalog: Partial<Record<ChartSource, string>> = {
    cards: "/api/cards",
    relics: "/api/relics",
    potions: "/api/potions",
    events: "/api/events",
  };
  const url = catalog[source];
  if (!url) return {};
  try {
    const res = await fetch(`${API}${url}`);
    if (!res.ok) return {};
    const list = (await res.json()) as Record<string, unknown>[];
    const out: Record<string, MetricRow> = {};
    for (const item of list) {
      const id = String(item.id ?? "");
      if (!id) continue;
      out[id.toUpperCase()] = {
        id,
        name: typeof item.name === "string" ? item.name : id,
        color: (item.color as string) ?? null,
        rarity: (item.rarity as string) ?? null,
        group: (item.pool as string) ?? (item.entity_type as string) ?? null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function fetchMetricRows(
  source: ChartSource,
  bracket: string,
  character: string | null,
): Promise<MetricRow[]> {
  const params = new URLSearchParams({ bracket });
  if (character) params.set("character", character);
  try {
    const res = await fetch(
      `${API}/api/runs/metrics/${source}?${params.toString()}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { rows?: Record<string, unknown>[] };
    return (data.rows ?? []).map((r) => ({
      ...(r as unknown as MetricRow),
      id: String(r.id ?? ""),
      name: typeof r.name === "string" ? r.name : undefined,
      upgraded: r.upgraded === true,
    }));
  } catch {
    return [];
  }
}

export function metricValue(row: MetricRow, key: MetricKey): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Sample size backing a row: the metrics rows carry picks everywhere the
 * min_sample filter applies; shop rows without picks don't qualify. */
function rowSample(row: MetricRow): number {
  return typeof row.picks === "number" ? row.picks : 0;
}

/** Join metrics with the catalog, apply filters, and keep the top N by the
 * chart's metric. Rows with no catalog entry are dropped exactly like the
 * metrics grid (a raw id never becomes a label); upgraded "+" rows are
 * excluded unless explicitly included. Bars color by the card color for
 * the cards source, otherwise the caller's accent applies. */
export function buildChartRows(
  rows: MetricRow[],
  names: Record<string, MetricRow>,
  spec: SavedChartSpec,
  opts?: { includeUpgraded?: boolean },
): { name: string; value: number; x: number | null; color?: string }[] {
  const f = spec.filters ?? {};
  const q = (f.search ?? "").trim().toLowerCase();
  const catalog: Partial<Record<ChartSource, boolean>> = {
    cards: true,
    relics: true,
    potions: true,
    events: true,
  };
  const joined = catalog[spec.source]
    ? rows.map((r) => ({ row: r, meta: names[r.id.toUpperCase()] ?? null }))
    : rows.map((r) => ({
        row: r,
        meta: names[r.id.toUpperCase()] ?? (r.name ? { name: r.name } : null),
      }));
  const enriched = joined
    .filter((r) => r.meta !== null)
    .filter((r) => !r.row.upgraded || opts?.includeUpgraded === true)
    .map((r) => ({
      name: r.meta?.name ?? "",
      value: metricValue(r.row, spec.y) ?? 0,
      x: metricValue(r.row, spec.x as MetricKey),
      sample: rowSample(r.row),
      meta: r.meta,
      color:
        spec.source === "cards" && r.meta?.color
          ? `var(--color-${r.meta.color})`
          : undefined,
    }))
    .filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (f.group && (r.meta?.group ?? "") !== f.group) return false;
      if (f.rarity && (r.meta?.rarity ?? "") !== f.rarity) return false;
      if (f.min_sample && r.sample < f.min_sample) return false;
      return true;
    });
  enriched.sort((a, b) =>
    spec.sort === "asc" ? a.value - b.value : b.value - a.value,
  );
  return enriched
    .slice(0, spec.top)
    .map(({ name, value, x, color }) => ({ name, value, x, color }));
}

export function defaultSpec(source: ChartSource = "cards"): SavedChartSpec {
  return {
    source,
    bracket: "solo:standard",
    character: null,
    chart: "bar",
    x: "pick_rate",
    y: "win_rate",
    filters: { min_sample: 20 },
    top: 25,
    sort: "desc",
  };
}
