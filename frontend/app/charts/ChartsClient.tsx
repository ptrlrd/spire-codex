"use client";

// The /charts explorer. All aggregation happens in the backend
// (/api/charts/{key}); this component is controls + a Chart.js canvas.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Line, Bar, Scatter } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Theme (matches the community-stats charts) ───────────────────────────────

const GOLD = "#d4a843";
const TEXT_SECONDARY = "#a1a1aa";
const GRID = "rgba(255,255,255,0.06)";

const CHAR_VARS: Record<string, string> = {
  IRONCLAD: "var(--color-ironclad)",
  SILENT: "var(--color-silent)",
  DEFECT: "var(--color-defect)",
  NECROBINDER: "var(--color-necrobinder)",
  REGENT: "var(--color-regent)",
};

// Fixed colors for non-character series ids (splits, outcome curves, entity
// chart roles), then a palette for anything else by series order.
const SERIES_HEX: Record<string, string> = {
  ALL: GOLD,
  WIN: "#34d399",
  LOSS: "#fb7185",
  PICK: "#38bdf8",
  WITH: "#34d399",
  BASE: "#8a8a93",
  WINRATE: "#34d399",
};
const PALETTE = ["#38bdf8", "#34d399", "#fb7185", "#a78bfa", "#f59e0b", "#2dd4bf", "#e879f9", "#fbbf24"];

function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  if (typeof window === "undefined") return GOLD;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(color.slice(4, -1))
      .trim() || GOLD
  );
}

function seriesColor(id: string, index: number): string {
  if (CHAR_VARS[id]) return resolveColor(CHAR_VARS[id]);
  if (SERIES_HEX[id]) return SERIES_HEX[id];
  return PALETTE[index % PALETTE.length];
}

const TOOLTIP_BASE = {
  backgroundColor: "#15151a",
  borderColor: "#33333a",
  borderWidth: 1,
  cornerRadius: 6,
  padding: 8,
  titleColor: "#e5e5e5",
  bodyColor: TEXT_SECONDARY,
  displayColors: true,
  boxWidth: 8,
  boxHeight: 8,
  titleFont: { size: 12 },
  bodyFont: { size: 12 },
} as const;

// ── API types ────────────────────────────────────────────────────────────────

interface ChartSpec {
  key: string;
  label: string;
  group: string;
  kind: "frame" | "blob";
  needs: string[];
  splits: string[];
  scatter: boolean;
  bars: boolean;
  horizontal: boolean;
  daily: boolean;
  etype_fixed: string | null;
  axis: { x: string; y: string };
  desc: string;
}
interface StatOpt {
  key: string;
  label: string;
}
interface NamedOpt {
  id: string;
  name: string;
  n?: number;
}
interface Point {
  x: number | string;
  y: number;
  n?: number;
  win?: number;
}
interface Series {
  id: string;
  label: string;
  points: Point[];
  total?: number;
  sampled_from?: number;
}
interface ChartResponse {
  chart: string;
  label: string;
  axis: { x: string; y: string };
  desc: string;
  series: Series[];
  total_runs: number;
  building?: boolean;
}
interface Meta {
  charts: ChartSpec[];
  stats: StatOpt[];
  characters: NamedOpt[];
  events: NamedOpt[];
  versions: string[];
}

const PLAYER_OPTS = [
  { value: "", label: "All runs" },
  { value: "1", label: "Solo" },
  { value: "2", label: "2P" },
  { value: "3", label: "3P" },
  { value: "4", label: "4P" },
];
const MODE_OPTS = [
  { value: "", label: "All modes" },
  { value: "standard", label: "Standard" },
  { value: "daily", label: "Daily" },
  { value: "custom", label: "Custom" },
];
const SPLIT_LABELS: Record<string, string> = {
  character: "By character",
  players: "By player count",
  outcome: "Wins vs losses",
  ascension: "By ascension band",
};
const ETYPES = [
  { value: "cards", label: "Card" },
  { value: "relics", label: "Relic" },
  { value: "potions", label: "Potion" },
];

function Pills({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || "all"}
            onClick={() => onChange(o.value)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
              active
                ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const selectCls =
  "bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 max-w-72";

export default function ChartsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [chart, setChart] = useState(searchParams.get("chart") || "winrate-by-floor");
  const [players, setPlayers] = useState(searchParams.get("players") || "");
  const [ascension, setAscension] = useState(searchParams.get("ascension") || "");
  const [gameMode, setGameMode] = useState(searchParams.get("mode") || "");
  const [usernameInput, setUsernameInput] = useState(searchParams.get("user") || "");
  const [username, setUsername] = useState(searchParams.get("user") || "");
  const [split, setSplit] = useState(searchParams.get("split") || "character");
  const [stat, setStat] = useState(searchParams.get("stat") || "deck_size");
  const [xStat, setXStat] = useState(searchParams.get("x") || "floors_reached");
  const [yStat, setYStat] = useState(searchParams.get("y") || "deck_size");
  const [encounter, setEncounter] = useState(searchParams.get("encounter") || "");
  const [event, setEvent] = useState(searchParams.get("event") || "");
  const [etype, setEtype] = useState(searchParams.get("etype") || "cards");
  const [entity, setEntity] = useState(searchParams.get("entity") || "");
  // Cross-cutting filters (apply to every chart).
  const [excludeA10, setExcludeA10] = useState(searchParams.get("a10") === "1");
  const [minWr, setMinWr] = useState(searchParams.get("minwr") || "");
  const [excludeMods, setExcludeMods] = useState(searchParams.get("nomods") === "1");
  const [version, setVersion] = useState(searchParams.get("version") || "");

  const [encounters, setEncounters] = useState<NamedOpt[]>([]);
  const [entityLists, setEntityLists] = useState<Record<string, NamedOpt[]>>({});

  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const spec = useMemo(() => meta?.charts.find((c) => c.key === chart), [meta, chart]);
  const effEtype = spec?.etype_fixed || etype;
  const needsEntity = spec?.needs.includes("entity") ?? false;

  // Debounce the username box so we don't fetch per keystroke.
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUsername = (v: string) => {
    setUsernameInput(v);
    if (userTimer.current) clearTimeout(userTimer.current);
    userTimer.current = setTimeout(() => setUsername(v.trim()), 500);
  };

  useEffect(() => {
    fetch(`${API}/api/charts/meta`)
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError("Could not load chart list"));
  }, []);

  // Lazy-load selector lists the first time a chart needs them.
  useEffect(() => {
    if (spec?.needs.includes("encounter") && encounters.length === 0) {
      fetch(`${API}/api/encounters?lang=eng`)
        .then((r) => r.json())
        .then((rows: { id: string; name: string }[]) => {
          const opts = rows
            .map((r) => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setEncounters(opts);
          if (!encounter && opts.length) setEncounter(opts[0].id);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    if (needsEntity && !entityLists[effEtype]) {
      fetch(`${API}/api/${effEtype}?lang=eng`)
        .then((r) => r.json())
        .then((rows: { id: string; name: string }[]) => {
          const opts = rows
            .map((r) => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setEntityLists((m) => ({ ...m, [effEtype]: opts }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsEntity, effEtype]);

  // A usable default entity/event once lists exist.
  useEffect(() => {
    if (needsEntity && !entity && entityLists[effEtype]?.length) {
      const list = entityLists[effEtype];
      const bash = list.find((e) => e.id === "BASH");
      setEntity((bash ?? list[0]).id);
    }
    if (spec?.needs.includes("event") && !event && meta?.events.length) {
      setEvent(meta.events[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsEntity, effEtype, entityLists, spec, meta]);

  // Keep the URL shareable.
  useEffect(() => {
    const p = new URLSearchParams();
    if (chart !== "winrate-by-floor") p.set("chart", chart);
    if (players) p.set("players", players);
    if (ascension) p.set("ascension", ascension);
    if (gameMode) p.set("mode", gameMode);
    if (username) p.set("user", username);
    if (split !== "character" && spec?.splits.includes(split)) p.set("split", split);
    if (spec?.needs.includes("stat") && stat) p.set("stat", stat);
    if (spec?.needs.includes("x")) {
      p.set("x", xStat);
      p.set("y", yStat);
    }
    if (spec?.needs.includes("encounter") && encounter) p.set("encounter", encounter);
    if (spec?.needs.includes("event") && event) p.set("event", event);
    if (needsEntity && entity) {
      if (!spec?.etype_fixed) p.set("etype", etype);
      p.set("entity", entity);
    }
    if (excludeA10) p.set("a10", "1");
    if (minWr) p.set("minwr", minWr);
    if (excludeMods) p.set("nomods", "1");
    if (version) p.set("version", version);
    const qs = p.toString();
    router.replace(`/charts${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [chart, players, ascension, gameMode, username, split, stat, xStat, yStat, encounter, event, etype, entity, needsEntity, spec, router, excludeA10, minWr, excludeMods, version]);

  // Fetch the chart itself.
  useEffect(() => {
    if (!spec) return;
    if (spec.needs.includes("encounter") && !encounter) return;
    if (spec.needs.includes("event") && !event) return;
    if (needsEntity && !entity) return;
    const p = new URLSearchParams();
    if (players) p.set("players", players);
    if (spec.kind === "frame" && !spec.daily && ascension) p.set("ascension", ascension);
    if (spec.kind === "frame" && !spec.daily && gameMode) p.set("game_mode", gameMode);
    if (username) p.set("username", username);
    if (spec.splits.includes(split) && split !== "character") p.set("split", split);
    if (spec.needs.includes("stat")) p.set("stat", stat);
    if (spec.needs.includes("x")) {
      p.set("x", xStat);
      p.set("y", yStat);
    }
    if (spec.needs.includes("encounter")) p.set("encounter", encounter);
    if (spec.needs.includes("event")) p.set("event", event);
    if (needsEntity) {
      p.set("etype", effEtype);
      p.set("entity", entity);
    }
    // Cross-cutting filters: sent for every chart, frame and blob.
    if (excludeA10) p.set("exclude_a10", "true");
    if (minWr) p.set("min_wr", minWr);
    if (excludeMods) p.set("exclude_mods", "true");
    if (version) p.set("version", version);
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    fetch(`${API}/api/charts/${spec.key}?${p}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ChartResponse) => {
        // Fill the generic "stat" axis placeholders with the chosen labels.
        const statLabel = (k: string) => meta?.stats.find((s) => s.key === k)?.label ?? k;
        if (spec.needs.includes("stat")) d.axis = { ...d.axis, x: statLabel(stat) };
        if (spec.needs.includes("x")) d.axis = { x: statLabel(xStat), y: statLabel(yStat) };
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [spec, meta, players, ascension, gameMode, username, split, stat, xStat, yStat, encounter, event, effEtype, entity, needsEntity, excludeA10, minWr, excludeMods, version]);

  const groups = useMemo(() => {
    const g = new Map<string, ChartSpec[]>();
    for (const c of meta?.charts ?? []) {
      g.set(c.group, [...(g.get(c.group) ?? []), c]);
    }
    return g;
  }, [meta]);

  const filtersLocked = spec?.kind === "blob" || spec?.daily;

  return (
    <div>
      {/* Controls */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select className={selectCls} value={chart} onChange={(e) => setChart(e.target.value)} aria-label="Chart">
            {[...groups.entries()].map(([group, charts]) => (
              <optgroup key={group} label={group}>
                {charts.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {spec?.needs.includes("stat") && (
            <select className={selectCls} value={stat} onChange={(e) => setStat(e.target.value)} aria-label="Run stat">
              {(meta?.stats ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {spec?.needs.includes("x") && (
            <>
              <select className={selectCls} value={xStat} onChange={(e) => setXStat(e.target.value)} aria-label="X stat">
                {(meta?.stats ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    X: {s.label}
                  </option>
                ))}
              </select>
              <select className={selectCls} value={yStat} onChange={(e) => setYStat(e.target.value)} aria-label="Y stat">
                {(meta?.stats ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    Y: {s.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {spec?.needs.includes("encounter") && (
            <select className={selectCls} value={encounter} onChange={(e) => setEncounter(e.target.value)} aria-label="Encounter">
              {encounters.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {spec?.needs.includes("event") && (
            <select className={selectCls} value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Event">
              {(meta?.events ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {needsEntity && (
            <>
              {!spec?.etype_fixed && (
                <select
                  className={selectCls}
                  value={etype}
                  onChange={(e) => {
                    setEtype(e.target.value);
                    setEntity("");
                  }}
                  aria-label="Entity type"
                >
                  {ETYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
              <select className={selectCls} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity">
                {(entityLists[effEtype] ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {(spec?.splits.length ?? 0) > 0 && (
            <select
              className={selectCls}
              value={spec!.splits.includes(split) ? split : "character"}
              onChange={(e) => setSplit(e.target.value)}
              aria-label="Split series by"
            >
              {spec!.splits.map((s) => (
                <option key={s} value={s}>
                  {SPLIT_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          )}

          <input
            className={`${selectCls} w-44`}
            placeholder="Username (optional)"
            value={usernameInput}
            onChange={(e) => onUsername(e.target.value)}
            aria-label="Filter to one player's runs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Pills options={PLAYER_OPTS} value={players} onChange={setPlayers} />
          <Pills options={MODE_OPTS} value={gameMode} onChange={setGameMode} disabled={filtersLocked} />
          <div className={filtersLocked ? "opacity-40 pointer-events-none" : ""}>
            <select className={selectCls} value={ascension} onChange={(e) => setAscension(e.target.value)} aria-label="Ascension">
              <option value="">All ascensions</option>
              {/* A10 is the cap; the game has nothing above it. */}
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={String(i)}>
                  A{i}
                </option>
              ))}
            </select>
          </div>
          {spec?.kind === "blob" && (
            <span className="text-xs text-[var(--text-muted)]">
              This chart covers all ascensions and modes.
            </span>
          )}
          {spec?.daily && (
            <span className="text-xs text-[var(--text-muted)]">Daily runs only.</span>
          )}
        </div>

        {/* Cross-cutting filters: apply to every chart, frame and blob. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={excludeA10}
              onChange={(e) => setExcludeA10(e.target.checked)}
              className="accent-[var(--accent-gold)]"
            />
            Exclude A10
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={excludeMods}
              onChange={(e) => setExcludeMods(e.target.checked)}
              className="accent-[var(--accent-gold)]"
            />
            Exclude mods
          </label>
          <select
            className={selectCls}
            value={minWr}
            onChange={(e) => setMinWr(e.target.value)}
            aria-label="Minimum player win rate"
          >
            <option value="">Any win rate</option>
            <option value="50">Players 50%+ WR</option>
            <option value="60">Players 60%+ WR</option>
            <option value="70">Players 70%+ WR</option>
          </select>
          {(meta?.versions?.length ?? 0) > 0 && (
            <select
              className={selectCls}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              aria-label="Game version"
            >
              <option value="">All versions</option>
              {meta!.versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Chart card */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        {error ? (
          <p className="text-sm text-rose-400 py-12 text-center">{error}</p>
        ) : !data || loading ? (
          <div className="h-[420px] flex items-center justify-center text-sm text-[var(--text-muted)]">
            Crunching runs…
          </div>
        ) : data.series.length === 0 ? (
          <div className="h-[420px] flex items-center justify-center text-sm text-[var(--text-muted)]">
            {data.building
              ? "These stats are still building after a fresh deploy. They cover every run and land within a few minutes."
              : "Not enough runs match these filters."}
          </div>
        ) : (
          <ExplorerChart spec={spec!} data={data} />
        )}
        {data && !loading && !error && (
          <p className="text-xs text-[var(--text-muted)] mt-3">
            {data.desc} Based on {data.total_runs.toLocaleString()} runs matching the filters.
            Thin samples are hidden so lines don&apos;t whip around on noise.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Rendering ────────────────────────────────────────────────────────────────

function ExplorerChart({ spec, data }: { spec: ChartSpec; data: ChartResponse }) {
  if (spec.scatter) return <ScatterChart data={data} />;
  if (spec.bars) return <BarRanking data={data} horizontal={spec.horizontal} />;
  return <LineChart data={data} />;
}

function legendOpts(count: number) {
  return {
    display: count > 1,
    labels: { color: TEXT_SECONDARY, boxWidth: 12, boxHeight: 12, font: { size: 12 } },
  };
}

function baseOptions(data: ChartResponse): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: legendOpts(data.series.length),
      tooltip: {
        ...TOOLTIP_BASE,
        callbacks: {
          label: (item: TooltipItem<"line">) => {
            const raw = item.raw as Point;
            const n = raw?.n != null ? ` · ${raw.n.toLocaleString()} runs` : "";
            return `${item.dataset.label}: ${item.parsed.y}${n}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: data.axis.x, color: TEXT_SECONDARY, font: { size: 12 } },
        ticks: { color: TEXT_SECONDARY, maxTicksLimit: 20 },
        grid: { color: GRID },
      },
      y: {
        title: { display: true, text: data.axis.y, color: TEXT_SECONDARY, font: { size: 12 } },
        ticks: { color: TEXT_SECONDARY },
        grid: { color: GRID },
        beginAtZero: true,
      },
    },
  };
}

function lineDataset(s: Series, i: number) {
  const color = seriesColor(s.id, i);
  return {
    label: s.label,
    borderColor: color,
    backgroundColor: color,
    borderWidth: s.id === "ALL" ? 2.5 : 1.5,
    pointRadius: 2,
    pointHoverRadius: 4,
    tension: 0.3,
    spanGaps: true,
    borderDash: s.id === "BASE" ? [6, 4] : undefined,
  };
}

function LineChart({ data }: { data: ChartResponse }) {
  const numericX = data.series.every((s) => s.points.every((p) => typeof p.x === "number"));
  const options = baseOptions(data);

  if (numericX) {
    (options.scales!.x as { type?: string }).type = "linear";
    const datasets = data.series.map((s, i) => ({
      ...lineDataset(s, i),
      data: s.points.map((p) => ({ x: p.x as number, y: p.y, n: p.n })),
    }));
    return (
      <div className="h-[460px]">
        <Line data={{ datasets }} options={options} />
      </div>
    );
  }

  // Category x (weeks, labels): union of labels, sorted.
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const s of data.series) {
    for (const p of s.points) {
      const k = String(p.x);
      if (!seen.has(k)) {
        seen.add(k);
        labels.push(k);
      }
    }
  }
  labels.sort();
  const datasets = data.series.map((s, i) => {
    const byX = new Map(s.points.map((p) => [String(p.x), p]));
    return {
      ...lineDataset(s, i),
      data: labels.map((l) => {
        const p = byX.get(l);
        return p ? { x: l, y: p.y, n: p.n } : { x: l, y: null as number | null };
      }),
    };
  });
  return (
    <div className="h-[460px]">
      <Line data={{ labels, datasets }} options={baseOptions(data)} />
    </div>
  );
}

function BarRanking({ data, horizontal }: { data: ChartResponse; horizontal: boolean }) {
  const barTooltip = (seriesFor: (item: TooltipItem<"bar">) => Series | undefined) => ({
    ...TOOLTIP_BASE,
    callbacks: {
      label: (item: TooltipItem<"bar">) => {
        const s = seriesFor(item);
        const p = s?.points[item.dataIndex];
        const v = horizontal ? item.parsed.x : item.parsed.y;
        const n = p?.n != null ? ` · ${p.n.toLocaleString()}` : "";
        return `${item.dataset.label}: ${v}${n}`;
      },
    },
  });

  if (horizontal && data.series.length === 1) {
    const s = data.series[0];
    const height = Math.max(160, s.points.length * 28);
    return (
      <div style={{ height }}>
        <Bar
          data={{
            labels: s.points.map((p) => String(p.x)),
            datasets: [
              { label: s.label, data: s.points.map((p) => p.y), backgroundColor: GOLD, borderRadius: 4 },
            ],
          }}
          options={{
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: barTooltip(() => s) },
            scales: {
              x: {
                title: { display: true, text: data.axis.y, color: TEXT_SECONDARY },
                ticks: { color: TEXT_SECONDARY },
                grid: { color: GRID },
                beginAtZero: true,
              },
              y: { ticks: { color: TEXT_SECONDARY, font: { size: 12 }, autoSkip: false }, grid: { display: false } },
            },
          }}
        />
      </div>
    );
  }

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const s of data.series) {
    for (const p of s.points) {
      const k = String(p.x);
      if (!seen.has(k)) {
        seen.add(k);
        labels.push(k);
      }
    }
  }
  const datasets = data.series.map((s, i) => {
    const byX = new Map(s.points.map((p) => [String(p.x), p]));
    return {
      label: s.label,
      data: labels.map((l) => byX.get(l)?.y ?? 0),
      backgroundColor: seriesColor(s.id, i),
      borderRadius: 4,
    };
  });
  return (
    <div className="h-[420px]">
      <Bar
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: legendOpts(datasets.length),
            tooltip: barTooltip((item) => data.series[item.datasetIndex]),
          },
          scales: {
            x: { ticks: { color: TEXT_SECONDARY, maxRotation: 60 }, grid: { display: false } },
            y: {
              title: { display: true, text: data.axis.y, color: TEXT_SECONDARY },
              ticks: { color: TEXT_SECONDARY },
              grid: { color: GRID },
              beginAtZero: true,
            },
          },
        }}
      />
    </div>
  );
}

function ScatterChart({ data }: { data: ChartResponse }) {
  const datasets = data.series.map((s, i) => ({
    label: s.label,
    data: s.points.map((p) => ({ x: p.x as number, y: p.y })),
    backgroundColor: seriesColor(s.id, i) + "b3",
    pointRadius: 2.5,
    pointHoverRadius: 4,
  }));
  const sampled = data.series.reduce((a, s) => a + (s.sampled_from ?? s.points.length), 0);
  return (
    <>
      <div className="h-[460px]">
        <Scatter
          data={{ datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: legendOpts(datasets.length),
              tooltip: {
                ...TOOLTIP_BASE,
                callbacks: {
                  label: (item: TooltipItem<"scatter">) =>
                    `${item.dataset.label}: ${item.parsed.x}, ${item.parsed.y}`,
                },
              },
            },
            scales: {
              x: {
                title: { display: true, text: data.axis.x, color: TEXT_SECONDARY },
                ticks: { color: TEXT_SECONDARY },
                grid: { color: GRID },
                beginAtZero: true,
              },
              y: {
                title: { display: true, text: data.axis.y, color: TEXT_SECONDARY },
                ticks: { color: TEXT_SECONDARY },
                grid: { color: GRID },
                beginAtZero: true,
              },
            },
          }}
        />
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-2">
        Sampled from {sampled.toLocaleString()} matching runs.
      </p>
    </>
  );
}
