"use client";

import { useT, useGameLocale, type TFn, useFormatNumber } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { cachedFetch } from "@/lib/fetch-cache";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import ScoreBadge, { scoreToTier } from "@/app/components/ScoreBadge";

// chart.js is ~70KB gzipped and the trends chart sits below the fold, so
// it must not ride in the first-load JS of every card/relic/potion page.
const EntityTrends = dynamic(() => import("./EntityTrends"), { ssr: false });
import {
  CONTENT_BRACKETS,
  DEFAULT_SOLO_BRACKET,
  PLAYER_BRACKETS,
  combineBracket,
  splitBracket,
} from "@/lib/content-brackets";
import { cohortLabel } from "@/app/[locale]/stats/_grid/bracket";
import {
  SMALL_SAMPLE_ROWS,
  metricsUrl,
  offerStatsFrom,
  resolveBracket,
  type MetricsTable,
} from "@/lib/entity-cohort";
import { dataThroughLabel } from "@/lib/data-through";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CharacterRow {
  character: string;
  picks: number;
  wins: number;
  win_rate: number;
}

export interface BracketStat {
  picks: number;
  wins: number;
  win_rate: number;
  elo: number | null;
  score: number | null;
  total_runs: number;
  pick_rate: number;
  baseline_win_rate?: number;
  lift?: number | null;
  lift_n?: number | null;
  hold_rate?: number | null;
  by_character?: CharacterRow[];
}

export interface EntityOfferStats {
  bracket: string;
  baseline_win_rate: number | null;
  data_through: string | null;
  pick_rate: number | null;
  pick_rate_by_act: (number | null)[];
  offered: number | null;
  picked: number | null;
}

export interface EntityStats {
  entity_type: string;
  entity_id: string;
  picks: number;
  wins: number;
  win_rate: number;
  pick_rate: number;
  total_runs: number;
  baseline_win_rate: number;
  score: number | null;
  elo: number | null;
  brackets?: Record<string, BracketStat>;
  by_character: CharacterRow[];
  last_submitted_at: string | null;
  last_run_hash: string | null;
  lift?: number | null;
  lift_n?: number | null;
  hold_rate?: number | null;
  metrics?: EntityOfferStats | null;
}

const METRICS_PAGE: Record<string, { path: string; label: string }> = {
  cards: { path: "/stats/cards", label: "See in Card Metrics" },
  relics: { path: "/stats/relics", label: "See in Relic Metrics" },
  potions: { path: "/stats/potions", label: "See in Potion Metrics" },
};

function fmtPct(v: number | null | undefined): string {
  return typeof v === "number" ? `${v.toFixed(1)}%` : "–";
}
function fmtPts(v: number | null | undefined): string {
  return typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}` : "–";
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MetricsStrip({
  entityType,
  entityName,
  stats,
  bracketKey,
  requested,
  base,
  dataThrough,
}: {
  entityType: string;
  entityName: string;
  stats: EntityStats;
  bracketKey: string;
  requested: string | null;
  base: BracketStat | null;
  dataThrough: string | null;
}) {
  const t = useT();
  const fmtN = useFormatNumber();
  const lang = useGameLocale();
  const bp = useBetaPrefix();
  const page = METRICS_PAGE[entityType];
  const winRate = base?.win_rate ?? stats.win_rate;
  const elo = base ? base.elo : stats.elo;
  const picks = base?.picks ?? stats.picks;
  const through = dataThroughLabel(dataThrough, t, lang);
  const items: [string, string, string][] = [
    [
      t("Win%"),
      fmtPct(winRate),
      t("Share of seats that held it and went on to win the run."),
    ],
    [
      t("Hold%"),
      fmtPct(base ? (base.hold_rate ?? base.pick_rate) : stats.pick_rate),
      t("Share of all seats in the cohort that held it at some point."),
    ],
    [
      t("Lift"),
      fmtPts(base ? base.lift : stats.lift),
      t(
        "Win rate minus what the same players were expected to win from the floor where they got it, in percentage points.",
      ),
    ],
    [
      t("Elo"),
      typeof elo === "number" ? String(Math.round(elo)) : "–",
      t(
        "Codex Elo: how often players take it over the other options on the same screen, fitted as a Bradley-Terry rating.",
      ),
    ],
    [t("Sample"), fmtN(picks), t("Seats that held it (sample size)")],
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 px-3 py-2 text-sm">
      <span className="text-xs text-[var(--text-muted)]">
        {t("Cohort")}: {capFirst(cohortLabel(bracketKey, t))}
      </span>
      {items.map(([k, v, title]) => (
        <span
          key={k}
          className="inline-flex items-baseline gap-1.5"
          title={title}
        >
          <span className="text-xs text-[var(--text-muted)]">{k}</span>
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {v}
          </span>
        </span>
      ))}
      {page && (
        <Link
          prefetch={false}
          href={`${bp}${page.path}?q=${encodeURIComponent(entityName)}&bracket=${encodeURIComponent(bracketKey)}`}
          className="ml-auto text-xs text-[var(--accent-gold)] hover:underline"
        >
          {t(page.label)} →
        </Link>
      )}
      {(requested || through) && (
        <span className="basis-full text-xs text-[var(--text-muted)]">
          {requested &&
            t("No data yet for {cohort}, so these numbers cover {shown}.", {
              cohort: capFirst(cohortLabel(requested, t)),
              shown: cohortLabel(bracketKey, t),
            })}
          {requested && through ? " " : ""}
          {through}
        </span>
      )}
    </div>
  );
}

interface Props {
  entityType: "relics" | "cards" | "potions";
  entityId: string;
  /** Display name for the prose summary (e.g. "Sozu", "Strike"). */
  entityName: string;
  /** "wiki" swaps the tabbed styling for the unrolled card-page layout
   * (stat tiles + bracket pills + by-character bars). Data/fetch/bracket
   * logic is identical; only the presentation changes. */
  variant?: "default" | "wiki";
  /** Server-fetched stats used as the initial state so the numbers render into
   * the SSR HTML (crawlable) instead of a client-only "Loading" placeholder.
   * The component still re-fetches on mount to stay fresh. */
  initialStats?: EntityStats | null;
  /** Controlled bracket: when provided, the pills drive this value instead of
   * internal state, so a parent (e.g. the card page's infobox mini-stats) can
   * scope to the same bracket the user picked. Uncontrolled if omitted. */
  bracket?: string;
  onBracketChange?: (b: string) => void;
}

/** Compact 1.2k / 44.8k style number for the wiki tiles + bars. */
function kFmt(n: number): string {
  return n >= 1000
    ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
    : String(n);
}

/** Tier letter → accent color for the Codex Score tile badge. */
const TIER_COLOR: Record<string, string> = {
  S: "var(--gold)",
  A: "var(--good)",
  B: "var(--defect)",
  C: "#9aa4ab",
  D: "var(--regent)",
  F: "var(--warn)",
};

/** Character enum → bar color, using the global site character tokens so the
 * bars read the same regardless of which entity's --spine is set. */
const CHAR_COLOR: Record<string, string> = {
  SILENT: "var(--color-silent)",
  IRONCLAD: "var(--color-ironclad)",
  DEFECT: "var(--color-defect)",
  NECROBINDER: "var(--color-necrobinder)",
  REGENT: "var(--color-regent)",
};

function relativeTime(iso: string | null, t: TFn): string {
  if (!iso) return "—";
  // SQLite stores `YYYY-MM-DD HH:MM:SS` without TZ; treat as UTC.
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const ts = new Date(safe).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  const minutes = diffSec / 60;
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{n}m ago", { n: Math.floor(minutes) });
  const hours = minutes / 60;
  if (hours < 24) return t("{n}h ago", { n: Math.floor(hours) });
  const days = hours / 24;
  if (days < 30) return t("{n}d ago", { n: Math.floor(days) });
  const months = days / 30;
  if (months < 12) return t("{n}mo ago", { n: Math.floor(months) });
  return t("{n}y ago", { n: Math.floor(months / 12) });
}

function characterPretty(c: string): string {
  // Names from the runs DB are uppercase enum values (IRONCLAD,
  // NECROBINDER). Title-case for display.
  if (!c) return "—";
  return c[0] + c.slice(1).toLowerCase();
}

function versionSortKey(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
}

function VersionScoreChart({
  brackets,
  lang,
}: {
  brackets: Record<string, BracketStat>;
  lang: string;
}) {
  const t = useT();
  const fmtN = useFormatNumber();
  const points = Object.keys(brackets)
    .filter(
      (k) => /^v\d+(\.\d+)*(-rc\.\d+)?$/.test(k) && brackets[k].score != null,
    )
    .sort((a, b) => {
      const ka = versionSortKey(a);
      const kb = versionSortKey(b);
      for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
        const d = (ka[i] || 0) - (kb[i] || 0);
        if (d) return d;
      }
      return 0;
    })
    .map((k) => ({ version: k, ...brackets[k] }));
  if (points.length < 2) return null;

  const w = 560;
  const h = 96;
  const padX = 10;
  const padTop = 12;
  const padBottom = 22;
  const scores = points.map((p) => p.score as number);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const span = max - min || 1;
  const step = (w - padX * 2) / (points.length - 1);
  const xy = points.map((p, i) => [
    padX + i * step,
    padTop +
      (1 - ((p.score as number) - min) / span) * (h - padTop - padBottom),
  ]);
  const d = xy
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="pb-4 border-b border-[var(--border-subtle)]">
      <div className="text-xs text-[var(--text-muted)] font-semibold mb-1.5">
        {t("Score by patch")}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
        <line
          x1={padX}
          y1={h - padBottom}
          x2={w - padX}
          y2={h - padBottom}
          stroke="var(--border-subtle)"
          strokeWidth="1"
        />
        <path
          d={d}
          fill="none"
          stroke="var(--accent-gold)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        {points.map((p, i) => (
          <g key={p.version}>
            <circle cx={xy[i][0]} cy={xy[i][1]} r="3" fill="var(--accent-gold)">
              <title>
                {`${p.version} · ${t("Codex Score")} ${p.score}` +
                  (p.elo != null ? ` · Elo ${Math.round(p.elo)}` : "") +
                  ` · ${p.win_rate}% ${t("win rate")} · ${fmtN(p.picks)} ${t("picks")}`}
              </title>
            </circle>
            <text
              x={xy[i][0]}
              y={xy[i][1] - 7}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-secondary)"
              className="tabular-nums"
            >
              {p.score}
            </text>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text
                x={xy[i][0]}
                y={h - 7}
                textAnchor={
                  i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
                }
                fontSize="9"
                fill="var(--text-muted)"
              >
                {p.version}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * "Stats" tab content, community-run aggregates for one entity.
 * Layout: factual prose summary on top (doubles as SEO body content),
 * full per-character breakdown table below. Renders a graceful empty
 * state when the entity has no submitted runs yet so SEO crawlers
 * still see something other than spinners.
 */
export default function EntityRunStats({
  entityType,
  entityId,
  entityName,
  variant = "default",
  initialStats = null,
  bracket,
  onBracketChange,
}: Props) {
  const [stats, setStats] = useState<EntityStats | null>(initialStats);
  const [internalBracket, setInternalBracket] = useState(DEFAULT_SOLO_BRACKET);
  const [showTiny, setShowTiny] = useState(false);
  const [fetched, setFetched] = useState<EntityOfferStats | null>(null);
  // Controlled when a parent passes `bracket`; internal otherwise.
  const selectedBracket = bracket ?? internalBracket;
  const setSelectedBracket = onBracketChange ?? setInternalBracket;
  const lang = useGameLocale();
  const t = useT();
  const fmtN = useFormatNumber();

  useEffect(() => {
    cachedFetch<EntityStats>(
      `${API}/api/runs/stats/${entityType}/${entityId}`,
    ).then((fresh) =>
      setStats((prev) => ({ ...fresh, metrics: prev?.metrics ?? null })),
    );
  }, [entityType, entityId]);

  const resolved = stats ? resolveBracket(stats, selectedBracket) : null;
  const resolvedKey = resolved?.key ?? null;
  const ssrMetricsKey = stats ? (stats.metrics?.bracket ?? "") : null;
  useEffect(() => {
    if (!resolvedKey || ssrMetricsKey === null) return;
    if (ssrMetricsKey === resolvedKey) return;
    let alive = true;
    cachedFetch<MetricsTable>(metricsUrl(API, entityType, resolvedKey))
      .then((table) => {
        if (alive) setFetched(offerStatsFrom(table, entityId, resolvedKey));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [entityType, entityId, resolvedKey, ssrMetricsKey]);

  if (!stats || !resolved) {
    return variant === "wiki" ? (
      <p className="h-note">{t("Loading run stats…")}</p>
    ) : (
      <p className="text-sm text-[var(--text-muted)]">
        {t("Loading run stats…")}
      </p>
    );
  }

  const empty = stats.picks === 0;
  const last = relativeTime(stats.last_submitted_at, t);

  // Bracket sub-menu: only the brackets with data for this entity. Selecting
  // one re-scopes the headline stats AND the per-character table below.
  const brackets = stats.brackets ?? {};
  const availableBrackets = CONTENT_BRACKETS.filter((b) => brackets[b.key]);
  // Player counts are a second axis (like the metrics page): picking Solo with
  // A10 selected reads the "solo:a10" composite block. Only offered when the
  // API response carries player-count brackets (post-update snapshots).
  const availablePlayers = PLAYER_BRACKETS.filter((b) => brackets[b.key]);
  const {
    player: selPlayer,
    skill: selSkill,
    version: selVersion,
  } = splitBracket(resolved.key);
  const pickPlayer = (p: string) =>
    setSelectedBracket(combineBracket(p, selSkill, selVersion));
  const pickSkill = (sk: string) =>
    setSelectedBracket(
      combineBracket(selPlayer, sk === "all" ? "" : sk, selVersion),
    );
  const sel = resolved.block;
  const metrics =
    [stats.metrics, fetched].find((m) => m?.bracket === resolved.key) ?? null;
  // Everything below scopes to the selected bracket, with a fall back to the
  // global figures for a pre-update API response that lacks the per-bracket data.
  const selPickRate = sel
    ? (sel.hold_rate ?? sel.pick_rate)
    : (stats.hold_rate ?? stats.pick_rate);
  const selTotalRuns = sel?.total_runs ?? stats.total_runs;
  const selByChar = sel?.by_character ?? stats.by_character;
  const top = selByChar[0];
  const maxCharPicks = top?.picks ?? 0;
  const tinyCount = selByChar.filter((r) => r.picks < SMALL_SAMPLE_ROWS).length;
  const charRows = showTiny
    ? selByChar
    : selByChar.filter((r) => r.picks >= SMALL_SAMPLE_ROWS);
  const tinyToggle = tinyCount > 0 && (
    <label className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      <input
        type="checkbox"
        checked={showTiny}
        onChange={(e) => setShowTiny(e.target.checked)}
      />
      {t("Show {count} rows under {min} samples", {
        count: tinyCount,
        min: SMALL_SAMPLE_ROWS,
      })}
    </label>
  );
  const offerActs = (metrics?.pick_rate_by_act ?? [])
    .map((v, i) => (v === null ? null : `${t("Act {n}", { n: i + 1 })} ${v}%`))
    .filter(Boolean)
    .join(" · ");
  const showOffer =
    entityType !== "potions" &&
    !!metrics &&
    metrics.pick_rate !== null &&
    (metrics.offered ?? 0) > 0;
  const isAll = resolved.key === "all";
  const selLabel =
    [
      availablePlayers.find((b) => b.key === selPlayer)?.label,
      CONTENT_BRACKETS.find((b) => b.key === (selSkill || "all"))?.label,
      selVersion || undefined,
    ]
      .filter(Boolean)
      .map((l) => (l && !/^v\d/.test(l) ? t(l) : l))
      .join(" · ") || t("All");

  // ── Wiki layout: stat tiles + bracket pills + by-character bars. Same data,
  // same bracket handling as the default tabbed view above; only styling
  // differs. Styling comes from the .card-rvmp scoped CSS on the card page. ──
  if (variant === "wiki") {
    const tier = sel?.score != null ? scoreToTier(sel.score) : null;
    const wr = sel?.win_rate ?? stats.win_rate;
    const wins = sel?.wins ?? stats.wins;
    const picks = sel?.picks ?? stats.picks;
    const share = top && picks ? Math.round((top.picks / picks) * 100) : 0;
    return (
      <div>
        {!empty && (
          <MetricsStrip
            entityType={entityType}
            entityName={entityName}
            stats={stats}
            bracketKey={resolved.key}
            requested={resolved.requested}
            base={sel}
            dataThrough={metrics?.data_through ?? null}
          />
        )}
        {empty ? (
          <p className="h-note">
            {t(
              "{name} hasn't appeared in any submitted community run yet (across {n} tracked).",
              { name: entityName, n: fmtN(stats.total_runs) },
            )}{" "}
            <Link href="/runs/submit">
              {t("Submit a run to seed this section.")}
            </Link>
          </p>
        ) : (
          <>
            {availableBrackets.length > 1 && (
              <div
                className="brkt"
                role="group"
                aria-label={t("Stats bracket")}
              >
                {availableBrackets.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className={`brkt-pill${(selSkill || "all") === b.key ? " on" : ""}`}
                    onClick={() => pickSkill(b.key)}
                  >
                    {t(b.label)}
                  </button>
                ))}
              </div>
            )}
            {availablePlayers.length > 0 && (
              <div className="brkt" role="group" aria-label={t("Player count")}>
                <button
                  type="button"
                  className={`brkt-pill${selPlayer === "" ? " on" : ""}`}
                  onClick={() => pickPlayer("")}
                >
                  {t("All players")}
                </button>
                {availablePlayers.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className={`brkt-pill${selPlayer === b.key ? " on" : ""}`}
                    onClick={() => pickPlayer(b.key)}
                  >
                    {t(b.label)}
                  </button>
                ))}
              </div>
            )}

            <div className="tiles">
              <div className="tile">
                <div className="k">{t("Win rate")}</div>
                <div
                  className="v"
                  style={{ color: wr >= 50 ? "var(--good)" : "var(--warn)" }}
                >
                  {wr}
                  <span style={{ fontSize: 16 }}>%</span>
                </div>
                <div className="s">
                  {kFmt(wins)} {t("of")} {kFmt(picks)} {t("wins")}
                </div>
              </div>
              <div className="tile">
                <div className="k">{t("Hold rate")}</div>
                <div className="v">
                  {selPickRate}
                  <span style={{ fontSize: 16 }}>%</span>
                </div>
                <div className="s">
                  {t("{n} runs held it", { n: fmtN(picks) })}
                </div>
              </div>
              {showOffer && metrics && (
                <div className="tile">
                  <div className="k">{t("Pick rate")}</div>
                  <div className="v">
                    {metrics.pick_rate}
                    <span style={{ fontSize: 16 }}>%</span>
                  </div>
                  <div className="s">
                    {t("{picked} of {offered} offers", {
                      picked: fmtN(metrics.picked ?? 0),
                      offered: fmtN(metrics.offered ?? 0),
                    })}
                  </div>
                </div>
              )}
              <div className="tile">
                <div className="k">{t("Codex Score")}</div>
                <div
                  className="v"
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  {tier ? (
                    <>
                      <span
                        className="tier"
                        style={{
                          background: TIER_COLOR[tier.letter] ?? "var(--warn)",
                        }}
                      >
                        {tier.letter}
                      </span>
                      <span>{sel?.score}</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="s">
                  {tier ? t(tier.label) : t("Not enough data")}
                </div>
              </div>
              <div className="tile">
                <div className="k">{t("Codex Elo")}</div>
                <div className="v">
                  {sel?.elo != null ? Math.round(sel.elo) : "—"}
                </div>
                <div className="s">{t("revealed preference")}</div>
              </div>
            </div>

            {showOffer && offerActs && (
              <p className="stat-note">
                {t("Pick rate by act:")} {offerActs}
              </p>
            )}

            {selByChar.length > 0 && (
              <>
                <h3 className="subh">
                  {t("Win rate by character")}
                  {!isAll ? ` · ${selLabel}` : ""}
                </h3>
                <div className="bars">
                  {charRows.map((row) => (
                    <div className="bar-row" key={row.character}>
                      <span className="name">
                        {characterPretty(row.character)}
                      </span>
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          style={{
                            width: `${row.win_rate}%`,
                            background:
                              CHAR_COLOR[row.character] ?? "var(--text-2)",
                          }}
                        />
                      </span>
                      <span className="num">
                        <b>{row.win_rate}%</b> · {kFmt(row.picks)}
                      </span>
                    </div>
                  ))}
                </div>
                {tinyToggle}
              </>
            )}

            {top && (
              <p className="insight">
                {t("Most often taken by")}{" "}
                <b>{characterPretty(top.character)}</b> {t("players")} (
                {fmtN(top.picks)} {t("picks")} · {share}% {t("share")}).
                {tier ? (
                  <>
                    {" "}
                    {t("Codex rates it")} <b>{tier.letter}</b> (
                    {t(tier.label).toLowerCase()}) {t("overall")}.
                  </>
                ) : null}
              </p>
            )}
            <EntityTrends
              entityType={entityType}
              entityId={entityId}
              bracket={selectedBracket}
              lang={lang}
            />
          </>
        )}

        <p className="stat-note">
          {t("Community-submitted runs only, refreshed every 30 minutes.")}
          {selTotalRuns > 0 && (
            <>
              {" "}
              {t("Hold rate is")} {selPickRate}% {t("of")} {fmtN(selTotalRuns)}
              {!isAll ? ` ${selLabel}` : ""} {t("tracked runs.")}
            </>
          )}{" "}
          <Link href="/stats/scoring">{t("How is the score calculated?")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!empty && (
        <MetricsStrip
          entityType={entityType}
          entityName={entityName}
          stats={stats}
          bracketKey={resolved.key}
          requested={resolved.requested}
          base={sel}
          dataThrough={metrics?.data_through ?? null}
        />
      )}
      {/* Bracket sub-menu: re-scopes the headline stats below. Only shown when
          a bracket beyond "All" has data for this entity. */}
      {!empty && availableBrackets.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] mr-1">
            {t("Bracket")}
          </span>
          {availableBrackets.map((b) => {
            const isActive = resolved.key === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setSelectedBracket(b.key)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  isActive
                    ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                    : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
                }`}
              >
                {t(b.label)}
              </button>
            );
          })}
        </div>
      )}

      {/* Codex Score hero for the selected bracket: 0-100 score badge plus the
          win rate with Codex Elo right beside it, and picks. Bayesian-shrunk so
          low-N entities sit near neutral. See `_compute_score`. */}
      {sel && sel.score != null && (
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-subtle)]">
          <ScoreBadge score={sel.score} size="lg" showNumber />
          <div className="text-xs text-[var(--text-muted)] leading-snug">
            <div className="text-[var(--text-secondary)] font-semibold mb-0.5">
              {t("Codex Score")}
              {!isAll ? ` · ${selLabel}` : ""}
            </div>
            <div>
              <strong className="text-[var(--text-secondary)]">
                {sel.win_rate}%
              </strong>{" "}
              {t("win rate")}
              {sel.elo != null && (
                <>
                  {" · "}
                  <strong className="text-[var(--text-secondary)]">
                    {Math.round(sel.elo)}
                  </strong>{" "}
                  {t("Elo")}
                </>
              )}
              {" · "}
              {fmtN(sel.picks)} {t("picks")}
              {" · "}
              <Link
                href="/stats/scoring"
                className="text-[var(--accent-gold)]/80 hover:text-[var(--accent-gold)] hover:underline"
              >
                {t("how is this calculated?")}
              </Link>
            </div>
          </div>
        </div>
      )}

      {!empty && <VersionScoreChart brackets={brackets} lang={lang} />}

      {/* Prose summary, also serves as crawlable SEO body content. */}
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        {empty ? (
          <>
            {t(
              "{name} hasn't appeared in any submitted community run yet (across {n} total runs tracked).",
              { name: entityName, n: fmtN(stats.total_runs) },
            )}{" "}
            <Link
              href="/runs/submit"
              className="text-[var(--accent-gold)] hover:underline"
            >
              {t("Submit a run that includes it to seed this section.")}
            </Link>
          </>
        ) : (
          <>
            <strong className="text-[var(--text-primary)]">
              {sel?.win_rate ?? stats.win_rate}%
            </strong>{" "}
            {t("win rate across")}{" "}
            <strong>{fmtN(sel?.picks ?? stats.picks)}</strong> {t("picks")}
            {top && (
              <>
                . {t("Most often taken by")}{" "}
                <strong className="text-[var(--text-primary)]">
                  {characterPretty(top.character)}
                </strong>{" "}
                {t("players")} ({fmtN(top.picks)} {t("picks")} ·{" "}
                {Math.round((top.picks / (sel?.picks ?? stats.picks)) * 100)}%{" "}
                {t("share")})
              </>
            )}
            . {t("Last picked")} <strong>{last}</strong>
            {stats.last_run_hash && (
              <>
                {" "}
                {t("in run")}{" "}
                <Link
                  // Frontend route is /runs/<hash>; the /shared/ segment
                  // exists only on the backend API (/api/runs/shared/<hash>)
                  // and was an early copy-paste mistake here.
                  href={`/runs/${stats.last_run_hash}`}
                  className="text-[var(--accent-gold)] hover:underline font-mono text-xs"
                >
                  #{stats.last_run_hash.slice(0, 8)}
                </Link>
              </>
            )}
            .
          </>
        )}
      </p>

      {/* Per-character breakdown table, hidden when empty. */}
      {!empty && selByChar.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {t("Picks by character")}
            {!isAll ? ` · ${selLabel}` : ""}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 pr-3 font-semibold">
                    {t("Character")}
                  </th>
                  <th className="text-right py-2 px-3 font-semibold">
                    {t("Picks")}
                  </th>
                  <th className="text-right py-2 px-3 font-semibold">
                    {t("Win Rate")}
                  </th>
                  <th className="text-left py-2 pl-3 font-semibold w-1/3">
                    {t("Distribution")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {charRows.map((row) => {
                  const pct = maxCharPicks
                    ? (row.picks / maxCharPicks) * 100
                    : 0;
                  return (
                    <tr
                      key={row.character}
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <td className="py-2 pr-3 text-[var(--text-secondary)]">
                        {characterPretty(row.character)}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">
                        {fmtN(row.picks)}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">
                        {row.win_rate}%
                      </td>
                      <td className="py-2 pl-3">
                        <div className="h-1.5 w-full rounded-full bg-[var(--bg-primary)]">
                          <div
                            className="h-1.5 rounded-full bg-[var(--accent-gold)]/60"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tinyToggle}
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        {t(
          "Stats reflect community-submitted runs only and refresh every 30 minutes.",
        )}
        {selTotalRuns > 0 && (
          <>
            {" "}
            {t("Hold rate:")} <strong>{selPickRate}%</strong> {t("of")}{" "}
            {fmtN(selTotalRuns)}
            {!isAll ? ` ${selLabel}` : ""} {t("tracked runs.")}
          </>
        )}
      </p>
    </div>
  );
}
