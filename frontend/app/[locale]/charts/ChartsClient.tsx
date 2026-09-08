"use client";

import { useT, useGameLocale, type TFn } from "@/lib/i18n";
// The /charts explorer. All aggregation happens in the backend
// (/api/charts/{key}); this component is controls + a Chart.js canvas.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { CONTENT_BRACKETS, normalizeBracket } from "@/lib/content-brackets";
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

// Fetch and parse JSON defensively. When the backend briefly returns HTML
// instead of JSON - a 502/504 gateway page while workers restart after a
// deploy, or an auth gate redirecting to a login page - a naive res.json()
// throws a cryptic "unexpected character at line 1 column 1". Check the status
// and content-type first and surface a clean, retryable message instead.
async function fetchJson<T>(url: string, init?: RequestInit, t?: TFn): Promise<T> {
  const res = await fetch(url, init);
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (!res.ok) {
    const detail = isJson
      ? await res
          .json()
          .then((b) => b?.detail)
          .catch(() => null)
      : null;
    throw new Error(detail || (t ? t("Server busy (HTTP {status})", { status: res.status }) : `Server busy (HTTP ${res.status})`));
  }
  if (!isJson) throw new Error(t ? t("Server returned a non-JSON response") : "Server returned a non-JSON response");
  return res.json() as Promise<T>;
}

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
  avg_minutes?: number;
  median_minutes?: number;
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
// Content brackets (apply to frame and blob charts; only the daily chart opts
// out). "all" sends no param.
const BRACKET_OPTS = CONTENT_BRACKETS.map((b) => ({ value: b.key, label: b.label }));
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

type NamedRow = { id?: string; name?: string; title?: string };
type NamedPayload = NamedRow[] | { options?: NamedRow[]; pages?: { options?: NamedRow[] }[] };

function namedRows(payload: NamedPayload): NamedRow[] {
  if (Array.isArray(payload)) return payload;
  return [...(payload.options ?? []), ...(payload.pages ?? []).flatMap((pg) => pg.options ?? [])];
}

function nameRemap(eng: NamedPayload, loc: NamedPayload): Record<string, string> {
  const byId = new Map<string, string>();
  for (const r of namedRows(loc)) {
    const name = r.name || r.title;
    if (r.id && name) byId.set(r.id, name);
  }
  const out: Record<string, string> = {};
  for (const r of namedRows(eng)) {
    const engName = r.name || r.title;
    const locName = r.id ? byId.get(r.id) : undefined;
    if (engName && locName) out[engName] = locName;
  }
  return out;
}

function remapUrls(spec: ChartSpec, event: string, lang: string): [string, string] | null {
  const kind = spec.key.startsWith("encounter-")
    ? "encounters"
    : spec.key === "enchant-winrate"
      ? "enchantments"
      : spec.key === "event-outcomes" && event
        ? `events/${event}`
        : null;
  if (!kind) return null;
  return [`${API}/api/${kind}?lang=eng`, `${API}/api/${kind}?lang=${lang}`];
}

function localizeChart(
  data: ChartResponse,
  spec: ChartSpec,
  t: TFn,
  charNames: Record<string, string>,
  xNames: Record<string, string>,
): ChartResponse {
  const seriesLabel = (s: Series) => {
    const base = s.label.replace(/ \(avg .*\)$/, "");
    const label = charNames[s.id.toLowerCase()] ?? xNames[base] ?? t(base);
    if (s.avg_minutes != null && s.median_minutes != null) {
      return t("{name} (avg {avg}m, median {med}m)", {
        name: label,
        avg: Math.round(s.avg_minutes),
        med: Math.round(s.median_minutes),
      });
    }
    return label;
  };
  const pointX = (x: number | string) => {
    if (typeof x !== "string") return x;
    if (spec.key === "deaths-by-room") return t(x.replace(/_/g, " "));
    if (spec.key === "acts-funnel") return t(x);
    return xNames[x] ?? x;
  };
  return {
    ...data,
    axis: { x: t(data.axis.x), y: t(data.axis.y) },
    series: data.series.map((s) => ({
      ...s,
      label: seriesLabel(s),
      points: s.points.map((p) => ({ ...p, x: pointX(p.x) })),
    })),
  };
}

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

function ChartsClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useGameLocale();
  const t = useT();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [chart, setChart] = useState(searchParams.get("chart") || "winrate-by-floor");
  const [players, setPlayers] = useState(searchParams.get("players") || "");
  const [ascension, setAscension] = useState(searchParams.get("ascension") || "");
  const [bracket, setBracket] = useState(() => normalizeBracket(searchParams.get("bracket")));
  // Game version: query-time on frame charts, per-version snapshot buckets
  // on blob charts — combines with every other filter either way.
  const [buildId, setBuildId] = useState(searchParams.get("version") || "");
  const [versions, setVersions] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVersions(d?.stat_versions || []))
      .catch(() => {});
  }, []);
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

  const [encounters, setEncounters] = useState<NamedOpt[]>([]);
  const [entityLists, setEntityLists] = useState<Record<string, NamedOpt[]>>({});
  const [eventNames, setEventNames] = useState<Record<string, string>>({});
  const [charNames, setCharNames] = useState<Record<string, string>>({});
  const [xNames, setXNames] = useState<Record<string, string>>({});

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
    fetchJson<Meta>(`${API}/api/charts/meta`)
      .then(setMeta)
      .catch(() => setError(t("Could not load chart list")));
  }, []);

  // Lazy-load selector lists the first time a chart needs them.
  useEffect(() => {
    if (spec?.needs.includes("encounter") && encounters.length === 0) {
      fetchJson<{ id: string; name: string }[]>(`${API}/api/encounters?lang=${lang}`)
        .then((rows) => {
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
      fetchJson<{ id: string; name: string }[]>(`${API}/api/${effEtype}?lang=${lang}`)
        .then((rows) => {
          const opts = rows
            .map((r) => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setEntityLists((m) => ({ ...m, [effEtype]: opts }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsEntity, effEtype]);

  useEffect(() => {
    cachedFetch<{ character_names?: Record<string, string> }>(`${API}/api/translations?lang=${lang}`)
      .then((d) => setCharNames(d?.character_names ?? {}))
      .catch(() => {});
  }, [lang]);

  useEffect(() => {
    if (!spec?.needs.includes("event") || lang === "eng") return;
    cachedFetch<{ id: string; name: string }[]>(`${API}/api/events?lang=${lang}`)
      .then((rows) => setEventNames(Object.fromEntries(rows.map((r) => [r.id, r.name]))))
      .catch(() => {});
  }, [spec, lang]);

  useEffect(() => {
    setXNames({});
    if (!spec || lang === "eng") return;
    const urls = remapUrls(spec, event, lang);
    if (!urls) return;
    let cancelled = false;
    Promise.all(urls.map((u) => cachedFetch<NamedPayload>(u)))
      .then(([eng, loc]) => {
        if (!cancelled) setXNames(nameRemap(eng, loc));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spec, event, lang]);

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
    if (bracket !== "all") p.set("bracket", bracket);
    if (buildId) p.set("version", buildId);
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
    const qs = p.toString();
    router.replace(`/charts${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [chart, players, ascension, bracket, buildId, gameMode, username, split, stat, xStat, yStat, encounter, event, etype, entity, needsEntity, spec, router]);

  // Fetch the chart itself.
  useEffect(() => {
    if (!spec) return;
    if (spec.needs.includes("encounter") && !encounter) return;
    if (spec.needs.includes("event") && !event) return;
    if (needsEntity && !entity) return;
    const p = new URLSearchParams();
    if (players) p.set("players", players);
    if (spec.kind === "frame" && !spec.daily && ascension) p.set("ascension", ascension);
    if (!spec.daily && bracket !== "all") p.set("bracket", bracket);
    if (buildId) p.set("build_id", buildId);
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
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();

    // Fetch with a couple of retries: right after a deploy the first hit can
    // land on a worker that's still restarting (a brief gateway error), so a
    // short backoff usually catches the backend once it's back instead of
    // failing the whole page. The loading state stays up while we retry.
    void (async () => {
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const d = await fetchJson<ChartResponse>(
            `${API}/api/charts/${spec.key}?${p}`,
            { signal: ctrl.signal },
            t,
          );
          // Fill the generic "stat" axis placeholders with the chosen labels.
          const statLabel = (k: string) =>
            meta?.stats.find((s) => s.key === k)?.label ?? k;
          if (spec.needs.includes("stat")) d.axis = { ...d.axis, x: statLabel(stat) };
          if (spec.needs.includes("x")) d.axis = { x: statLabel(xStat), y: statLabel(yStat) };
          setData(d);
          setLoading(false);
          return;
        } catch (e) {
          if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
          if (attempt < attempts) {
            await new Promise((r) => setTimeout(r, attempt * 800));
            if (ctrl.signal.aborted) return;
            continue;
          }
          setError(String((e as Error).message || e));
          setLoading(false);
        }
      }
    })();
    return () => ctrl.abort();
  }, [spec, meta, players, ascension, bracket, buildId, gameMode, username, split, stat, xStat, yStat, encounter, event, effEtype, entity, needsEntity, t]);

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
          <select className={selectCls} value={chart} onChange={(e) => setChart(e.target.value)} aria-label={t("Chart")}>
            {[...groups.entries()].map(([group, charts]) => (
              <optgroup key={group} label={t(group)}>
                {charts.map((c) => (
                  <option key={c.key} value={c.key}>
                    {t(c.label)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {spec?.needs.includes("stat") && (
            <select className={selectCls} value={stat} onChange={(e) => setStat(e.target.value)} aria-label={t("Run stat")}>
              {(meta?.stats ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          )}
          {spec?.needs.includes("x") && (
            <>
              <select className={selectCls} value={xStat} onChange={(e) => setXStat(e.target.value)} aria-label={t("X stat")}>
                {(meta?.stats ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    X: {t(s.label)}
                  </option>
                ))}
              </select>
              <select className={selectCls} value={yStat} onChange={(e) => setYStat(e.target.value)} aria-label={t("Y stat")}>
                {(meta?.stats ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    Y: {t(s.label)}
                  </option>
                ))}
              </select>
            </>
          )}
          {spec?.needs.includes("encounter") && (
            <select className={selectCls} value={encounter} onChange={(e) => setEncounter(e.target.value)} aria-label={t("Encounter")}>
              {encounters.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {spec?.needs.includes("event") && (
            <select className={selectCls} value={event} onChange={(e) => setEvent(e.target.value)} aria-label={t("Event")}>
              {(meta?.events ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {eventNames[o.id] ?? o.name}
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
                  aria-label={t("Entity type")}
                >
                  {ETYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
              )}
              <select className={selectCls} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={t("Entity")}>
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
              aria-label={t("Split series by")}
            >
              {spec!.splits.map((s) => (
                <option key={s} value={s}>
                  {t(SPLIT_LABELS[s] ?? s)}
                </option>
              ))}
            </select>
          )}

          <input
            className={`${selectCls} w-44`}
            placeholder={t("Username (optional)")}
            value={usernameInput}
            onChange={(e) => onUsername(e.target.value)}
            aria-label={t("Filter to one player's runs")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Pills options={PLAYER_OPTS.map((o) => ({ ...o, label: t(o.label) }))} value={players} onChange={setPlayers} />
          <Pills options={MODE_OPTS.map((o) => ({ ...o, label: t(o.label) }))} value={gameMode} onChange={setGameMode} disabled={filtersLocked} />
          <div className={filtersLocked ? "opacity-40 pointer-events-none" : ""}>
            <select className={selectCls} value={ascension} onChange={(e) => setAscension(e.target.value)} aria-label={t("Ascension")}>
              <option value="">{t("All ascensions")}</option>
              {/* A10 is the cap; the game has nothing above it. */}
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={String(i)}>
                  A{i}
                </option>
              ))}
            </select>
          </div>
          {/* Content bracket: works on both frame and blob charts (the blob is
              accumulated per bracket). Only the daily chart opts out. */}
          <Pills
            options={BRACKET_OPTS.map((o) => ({ ...o, label: t(o.label) }))}
            value={bracket}
            onChange={setBracket}
            disabled={spec?.daily}
          />
          {/* Game version: combines with every other filter (query-time on
              frame charts, per-version snapshot buckets on blob charts). */}
          {versions.length > 0 && (
            <select
              value={buildId}
              onChange={(e) => setBuildId(e.target.value)}
              aria-label={t("Game version")}
              className="text-xs px-2 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
            >
              <option value="">{t("All versions")}</option>
              {versions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          )}
          {spec?.kind === "blob" && (
            <span className="text-xs text-[var(--text-muted)]">
              {t("Exact ascension and mode don't apply here; use the Bracket to slice by skill.")}
            </span>
          )}
          {spec?.daily && (
            <span className="text-xs text-[var(--text-muted)]">{t("Daily runs only.")}</span>
          )}
        </div>
      </div>

      {/* Chart card */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        {error ? (
          <p className="text-sm text-danger py-12 text-center">{error}</p>
        ) : !data || loading ? (
          <div className="h-[420px] flex items-center justify-center text-sm text-[var(--text-muted)]">
            {t("Crunching runs…")}
          </div>
        ) : data.series.length === 0 ? (
          <div className="h-[420px] flex items-center justify-center text-sm text-[var(--text-muted)]">
            {data.building
              ? t("These stats are still building after a fresh deploy. They cover every run and land within a few minutes.")
              : t("Not enough runs match these filters.")}
          </div>
        ) : (
          <ExplorerChart spec={spec!} data={localizeChart(data, spec!, t, charNames, xNames)} lang={lang} />
        )}
        {data && !loading && !error && (
          <p className="text-xs text-[var(--text-muted)] mt-3">
            {t(data.desc)} {t("Based on {n} runs matching the filters.", { n: data.total_runs.toLocaleString() })}{" "}
            {t("Thin samples are hidden so lines don't whip around on noise.")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Rendering ────────────────────────────────────────────────────────────────

function ExplorerChart({ spec, data, lang }: { spec: ChartSpec; data: ChartResponse; lang: string }) {
  if (spec.scatter) return <ScatterChart data={data} lang={lang} />;
  if (spec.bars) return <BarRanking data={data} horizontal={spec.horizontal} />;
  return <LineChart data={data} lang={lang} />;
}

function legendOpts(count: number) {
  return {
    display: count > 1,
    labels: { color: TEXT_SECONDARY, boxWidth: 12, boxHeight: 12, font: { size: 12 } },
  };
}

function baseOptions(data: ChartResponse, t: TFn): ChartOptions<"line"> {
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
            const n = raw?.n != null ? ` · ${raw.n.toLocaleString()} ${t("runs")}` : "";
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

function LineChart({ data, lang }: { data: ChartResponse; lang: string }) {
  const t = useT();
  const numericX = data.series.every((s) => s.points.every((p) => typeof p.x === "number"));
  const options = baseOptions(data, t);

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
      <Line data={{ labels, datasets }} options={baseOptions(data, t)} />
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

function ScatterChart({ data, lang }: { data: ChartResponse; lang: string }) {
  const t = useT();
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
        {t("Sampled from {n} matching runs.", { n: sampled.toLocaleString() })}
      </p>
    </>
  );
}

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function ChartsClient() {
  return (
    <Suspense fallback={null}>
      <ChartsClientInner  />
    </Suspense>
  );
}
