"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import ScoreBadge, { scoreToTier } from "@/app/components/ScoreBadge";
import EntityTrends from "./EntityTrends";
import { CONTENT_BRACKETS } from "@/lib/content-brackets";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CharacterRow {
  character: string;
  picks: number;
  wins: number;
  win_rate: number;
}

interface BracketStat {
  picks: number;
  wins: number;
  win_rate: number;
  elo: number | null;
  score: number | null;
  total_runs: number;
  pick_rate: number;
  by_character?: CharacterRow[];
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
}

/** Compact 1.2k / 44.8k style number for the wiki tiles + bars. */
function kFmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
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

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  // SQLite stores `YYYY-MM-DD HH:MM:SS` without TZ; treat as UTC.
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const ts = new Date(safe).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  const minutes = diffSec / 60;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  const months = days / 30;
  if (months < 12) return `${Math.floor(months)}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function characterPretty(c: string): string {
  // Names from the runs DB are uppercase enum values (IRONCLAD,
  // NECROBINDER). Title-case for display.
  if (!c) return "—";
  return c[0] + c.slice(1).toLowerCase();
}

/**
 * "Stats" tab content, community-run aggregates for one entity.
 * Layout: factual prose summary on top (doubles as SEO body content),
 * full per-character breakdown table below. Renders a graceful empty
 * state when the entity has no submitted runs yet so SEO crawlers
 * still see something other than spinners.
 */
export default function EntityRunStats({ entityType, entityId, entityName, variant = "default", initialStats = null }: Props) {
  const [stats, setStats] = useState<EntityStats | null>(initialStats);
  const [selectedBracket, setSelectedBracket] = useState("all");
  const { lang } = useLanguage();

  useEffect(() => {
    cachedFetch<EntityStats>(`${API}/api/runs/stats/${entityType}/${entityId}`).then(setStats);
  }, [entityType, entityId]);

  if (!stats) {
    return variant === "wiki" ? (
      <p className="h-note">{t("Loading run stats…", lang)}</p>
    ) : (
      <p className="text-sm text-[var(--text-muted)]">{t("Loading run stats…", lang)}</p>
    );
  }

  const empty = stats.picks === 0;
  const last = relativeTime(stats.last_submitted_at);

  // Bracket sub-menu: only the brackets with data for this entity. Selecting
  // one re-scopes the headline stats AND the per-character table below.
  const brackets = stats.brackets ?? {};
  const availableBrackets = CONTENT_BRACKETS.filter((b) => brackets[b.key]);
  const sel = brackets[selectedBracket] ?? brackets["all"];
  // Everything below scopes to the selected bracket, with a fall back to the
  // global figures for a pre-update API response that lacks the per-bracket data.
  const selPickRate = sel?.pick_rate ?? stats.pick_rate;
  const selTotalRuns = sel?.total_runs ?? stats.total_runs;
  const selByChar = sel?.by_character ?? stats.by_character;
  const top = selByChar[0];
  const maxCharPicks = top?.picks ?? 0;
  const isAll = selectedBracket === "all";
  const selLabel =
    CONTENT_BRACKETS.find((b) => b.key === selectedBracket)?.label ?? "All";

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
        {empty ? (
          <p className="h-note">
            {entityName} hasn&apos;t appeared in any submitted community run yet
            (across {stats.total_runs.toLocaleString()} tracked). Submit a run via{" "}
            <Link href="/leaderboards/submit">the runs page</Link> to seed this
            section.
          </p>
        ) : (
          <>
            {availableBrackets.length > 1 && (
              <div className="brkt" role="group" aria-label="Stats bracket">
                {availableBrackets.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className={`brkt-pill${selectedBracket === b.key ? " on" : ""}`}
                    onClick={() => setSelectedBracket(b.key)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}

            <div className="tiles">
              <div className="tile">
                <div className="k">{t("Win rate", lang)}</div>
                <div
                  className="v"
                  style={{ color: wr >= 50 ? "var(--good)" : "var(--warn)" }}
                >
                  {wr}
                  <span style={{ fontSize: 16 }}>%</span>
                </div>
                <div className="s">
                  {kFmt(wins)} {t("of", lang)} {kFmt(picks)} {t("wins", lang)}
                </div>
              </div>
              <div className="tile">
                <div className="k">{t("Pick rate", lang)}</div>
                <div className="v">
                  {selPickRate}
                  <span style={{ fontSize: 16 }}>%</span>
                </div>
                <div className="s">{picks.toLocaleString()} {t("picks", lang)}</div>
              </div>
              <div className="tile">
                <div className="k">{t("Codex Score", lang)}</div>
                <div
                  className="v"
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  {tier ? (
                    <>
                      <span
                        className="tier"
                        style={{ background: TIER_COLOR[tier.letter] ?? "var(--warn)" }}
                      >
                        {tier.letter}
                      </span>
                      <span>{sel?.score}</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="s">{tier ? t(tier.label, lang) : t("Not enough data", lang)}</div>
              </div>
              <div className="tile">
                <div className="k">{t("Codex Elo", lang)}</div>
                <div className="v">
                  {sel?.elo != null ? Math.round(sel.elo) : "—"}
                </div>
                <div className="s">{t("revealed preference", lang)}</div>
              </div>
            </div>

            {selByChar.length > 0 && (
              <>
                <h3 className="subh">
                  {t("Win rate by character", lang)}{!isAll ? ` · ${selLabel}` : ""}
                </h3>
                <div className="bars">
                  {selByChar.map((row) => (
                    <div className="bar-row" key={row.character}>
                      <span className="name">{characterPretty(row.character)}</span>
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          style={{
                            width: `${row.win_rate}%`,
                            background: CHAR_COLOR[row.character] ?? "var(--text-2)",
                          }}
                        />
                      </span>
                      <span className="num">
                        <b>{row.win_rate}%</b> · {kFmt(row.picks)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {top && (
              <p className="insight">
                {t("Most often taken by", lang)} <b>{characterPretty(top.character)}</b> {t("players", lang)}
                ({top.picks.toLocaleString()} {t("picks", lang)} · {share}% {t("share", lang)}).
                {tier ? (
                  <>
                    {" "}
                    {t("Codex rates it", lang)} <b>{tier.letter}</b> ({t(tier.label, lang).toLowerCase()}){" "}
                    {t("overall", lang)}.
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
          {t("Community-submitted runs only, refreshed every 30 minutes.", lang)}
          {selTotalRuns > 0 && (
            <>
              {" "}
              {t("Pick rate is", lang)} {selPickRate}% {t("of", lang)} {selTotalRuns.toLocaleString()}
              {!isAll ? ` ${selLabel}` : ""} {t("tracked runs.", lang)}
            </>
          )}{" "}
          <Link href="/leaderboards/scoring">{t("How is the score calculated?", lang)}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bracket sub-menu: re-scopes the headline stats below. Only shown when
          a bracket beyond "All" has data for this entity. */}
      {!empty && availableBrackets.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] mr-1">{t("Bracket", lang)}</span>
          {availableBrackets.map((b) => {
            const isActive = selectedBracket === b.key;
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
                {b.label}
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
              {t("Codex Score", lang)}{selectedBracket !== "all" ? ` · ${selLabel}` : ""}
            </div>
            <div>
              <strong className="text-[var(--text-secondary)]">{sel.win_rate}%</strong> {t("win rate", lang)}
              {sel.elo != null && (
                <>
                  {" · "}
                  <strong className="text-[var(--text-secondary)]">{Math.round(sel.elo)}</strong> {t("Elo", lang)}
                </>
              )}
              {" · "}
              {sel.picks.toLocaleString()} {t("picks", lang)}
              {" · "}
              <Link
                href="/leaderboards/scoring"
                className="text-[var(--accent-gold)]/80 hover:text-[var(--accent-gold)] hover:underline"
              >
                {t("how is this calculated?", lang)}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Prose summary, also serves as crawlable SEO body content. */}
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        {empty ? (
          <>
            {entityName} hasn&apos;t appeared in any submitted community run yet
            (across {stats.total_runs.toLocaleString()} total runs tracked).
            Submit a run that includes it via{" "}
            <Link href="/leaderboards/submit" className="text-[var(--accent-gold)] hover:underline">
              the runs page
            </Link>{" "}
            to seed this section.
          </>
        ) : (
          <>
            <strong className="text-[var(--text-primary)]">{sel.win_rate}%</strong>{" "}
            {t("win rate across", lang)}{" "}
            <strong>{sel.picks.toLocaleString()}</strong> {t("picks", lang)}
            {top && (
              <>
                . {t("Most often taken by", lang)}{" "}
                <strong className="text-[var(--text-primary)]">
                  {characterPretty(top.character)}
                </strong>{" "}
                {t("players", lang)} ({top.picks.toLocaleString()} {t("picks", lang)} ·{" "}
                {Math.round((top.picks / sel.picks) * 100)}% {t("share", lang)})
              </>
            )}
            . {t("Last picked", lang)} <strong>{last}</strong>
            {stats.last_run_hash && (
              <>
                {" "}{t("in run", lang)}{" "}
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
            {t("Picks by character", lang)}{!isAll ? ` · ${selLabel}` : ""}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 pr-3 font-semibold">{t("Character", lang)}</th>
                  <th className="text-right py-2 px-3 font-semibold">{t("Picks", lang)}</th>
                  <th className="text-right py-2 px-3 font-semibold">{t("Win Rate", lang)}</th>
                  <th className="text-left py-2 pl-3 font-semibold w-1/3">{t("Distribution", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {selByChar.map((row) => {
                  const pct = maxCharPicks ? (row.picks / maxCharPicks) * 100 : 0;
                  return (
                    <tr
                      key={row.character}
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <td className="py-2 pr-3 text-[var(--text-secondary)]">
                        {characterPretty(row.character)}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">
                        {row.picks.toLocaleString()}
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
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        {t("Stats reflect community-submitted runs only and refresh every 30 minutes.", lang)}
        {selTotalRuns > 0 && (
          <>
            {" "}{t("Pick rate:", lang)} <strong>{selPickRate}%</strong> {t("of", lang)}{" "}
            {selTotalRuns.toLocaleString()}
            {!isAll ? ` ${selLabel}` : ""} {t("tracked runs.", lang)}
          </>
        )}
      </p>
    </div>
  );
}
