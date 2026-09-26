export interface BrowseConfig {
  endpoint: string;
  path: string;
  title: string;
  kicker: string;
  outro: string;
  totalLabel: string;
  emptyLabel: string;
  watch: boolean;
  summary: boolean;
  hint?: string;
  hintLink?: { label: string; href: string };
}

export const RUNS_BROWSE: BrowseConfig = {
  endpoint: "/api/runs/list",
  path: "/runs",
  title: "Browse Runs",
  kicker: "Find any run.",
  outro: "Click any run to see the full breakdown.",
  totalLabel: "runs total",
  emptyLabel: "No runs found.",
  watch: false,
  summary: false,
};

export const REPLAYS_BROWSE: BrowseConfig = {
  endpoint: "/api/replays",
  path: "/replays",
  title: "Browse Replays",
  kicker: "Find a replay to watch.",
  outro: "Every run here has a replay. Click one to watch it floor by floor.",
  totalLabel: "replays total",
  emptyLabel: "No replays found.",
  watch: true,
  summary: true,
  hint: "replays_mod_hint",
  hintLink: { label: "Spire Codex mod", href: "/mod" },
};

export function browseRowHref(
  config: Pick<BrowseConfig, "watch">,
  bp: string,
  runHash: string,
): string {
  const base = `${bp}/runs/${runHash}`;
  return config.watch ? `${base}/replay` : base;
}
