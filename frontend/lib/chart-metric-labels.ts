import type { MetricKey } from "@/lib/saved-chart-spec";

/** Human metric names for labels and axes; never show the raw key. */
export const METRIC_LABELS: Record<MetricKey, string> = {
  win_rate: "Win rate",
  lift: "Lift",
  elo: "Codex Elo",
  pick_rate: "Pick rate",
  hold_rate: "Hold rate",
  picks: "Picks",
  score: "Codex Score",
  buy_rate: "Buy rate",
  share: "Share",
  use_rate: "Used rate",
};

/** Axis unit suffix: % for the rate metrics, points for Lift, none for counts. */
export function metricUnit(key: string): string {
  if (key === "lift") return "points";
  const rates: MetricKey[] = [
    "win_rate",
    "pick_rate",
    "hold_rate",
    "buy_rate",
    "share",
    "use_rate",
  ];
  return rates.includes(key as MetricKey) ? "%" : "";
}
