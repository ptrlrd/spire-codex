"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import MyTierLists from "../tier-list-maker/MyTierLists";
import { characterHex } from "@/lib/character-colors";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface EntityInfo {
  id: string;
  name: string;
  image_url: string | null;
}

interface PersonalBest {
  run_hash: string;
  character: string;
  run_time: number;
  ascension: number;
  floors_reached: number;
}

interface PersonalBests {
  fastest_solo?: PersonalBest;
  fastest_multi?: PersonalBest;
  highest_ascension?: PersonalBest;
  todays_daily?: PersonalBest;
  fastest_daily?: PersonalBest;
}

interface DailyLeaderboardEntry {
  run_hash: string;
  username: string | null;
  character: string;
  run_time: number;
  ascension: number;
  is_current_user: boolean;
}

interface CompetitiveData {
  daily_leaderboard: {
    runs: DailyLeaderboardEntry[];
    user_rank: number | null;
    total_today: number;
  };
  personal_ranks: Record<string, { rank: number; total: number } | null>;
  win_rate_comparison: {
    character: string;
    user_win_rate: number;
    community_win_rate: number;
    user_wins: number;
    user_total: number;
  }[];
}

interface Stats {
  total_runs: number;
  total_wins?: number;
  total_abandoned?: number;
  win_rate?: number;
  characters?: { character: string; total: number; wins: number; win_rate: number }[];
  top_cards?: { card_id: string; count: number; in_wins: number; total_runs_with: number; win_runs: number }[];
  top_relics?: { relic_id: string; count: number; total_runs_with: number; win_runs: number }[];
  top_potions?: { potion_id: string; offered: number; picked: number; used: number; pick_rate: number }[];
  deadliest?: { encounter: string; count: number }[];
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function displayName(id: string): string {
  return id
    .replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function EntityRow({ name, imageSrc, stat, href }: { name: string; imageSrc: string | null; stat: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-1.5 hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 transition-colors">
      <span className="flex-shrink-0 w-8 h-8 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
        {imageSrc ? (
          <img src={imageSrc} alt={name} className="w-full h-full object-contain p-0.5" crossOrigin="anonymous" />
        ) : (
          <span className="text-[9px] text-[var(--text-muted)]">—</span>
        )}
      </span>
      <span className="flex-1 truncate text-sm text-[var(--text-primary)]">{name}</span>
      <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{stat}</span>
    </Link>
  );
}

const STARTER_CARDS = new Set([
  "STRIKE_IRONCLAD", "STRIKE_SILENT", "STRIKE_DEFECT", "STRIKE_NECROBINDER", "STRIKE_REGENT",
  "DEFEND_IRONCLAD", "DEFEND_SILENT", "DEFEND_DEFECT", "DEFEND_NECROBINDER", "DEFEND_REGENT",
]);

const STARTER_RELICS = new Set([
  "BURNING_BLOOD", "RING_OF_THE_SNAKE", "CRACKED_CORE", "BOUND_PHYLACTERY", "DIVINE_RIGHT",
]);

interface Run {
  run_hash: string;
  character: string;
  win: boolean;
  was_abandoned: boolean;
  ascension: number;
  floors_reached: number;
  submitted_at: string;
}

interface ProfileStatsProps {
  runs: Run[];
  runsTotal: number;
  runsLoading: boolean;
  runsPage: number;
  runsTotalPages: number;
  onPageChange: (page: number | ((p: number) => number)) => void;
  onDeleteRun: (hash: string) => void;
  deleteConfirm: string | null;
  onDeleteConfirm: (hash: string | null) => void;
}

type Tab = "overview" | "runs" | "cards" | "relics" | "potions" | "tierlists";

export default function ProfileStats({
  runs, runsTotal, runsLoading, runsPage, runsTotalPages,
  onPageChange, onDeleteRun, deleteConfirm, onDeleteConfirm,
}: ProfileStatsProps) {
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const [stats, setStats] = useState<Stats | null>(null);
  const [bests, setBests] = useState<PersonalBests | null>(null);
  const [competitive, setCompetitive] = useState<CompetitiveData | null>(null);
  const [cardData, setCardData] = useState<Record<string, EntityInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, EntityInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, EntityInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, bestsRes, competitiveRes, cards, relics, potions] = await Promise.all([
          fetch(`${API}/api/auth/stats`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
          fetch(`${API}/api/auth/personal-bests`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
          fetch(`${API}/api/auth/competitive`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
          cachedFetch<EntityInfo[]>(`${API}/api/cards`),
          cachedFetch<EntityInfo[]>(`${API}/api/relics`),
          cachedFetch<EntityInfo[]>(`${API}/api/potions`),
        ]);
        if (statsRes) setStats(statsRes);
        if (bestsRes) setBests(bestsRes);
        if (competitiveRes) setCompetitive(competitiveRes);
        const cm: Record<string, EntityInfo> = {};
        for (const c of cards) cm[c.id] = c;
        setCardData(cm);
        const rm: Record<string, EntityInfo> = {};
        for (const r of relics) rm[r.id] = r;
        setRelicData(rm);
        const pm: Record<string, EntityInfo> = {};
        for (const p of potions) pm[p.id] = p;
        setPotionData(pm);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-[var(--bg-card)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats || stats.total_runs === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)] py-4">
        {t("No stats yet. Upload runs to see your personal stats here.", lang)}
      </p>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "runs", label: t("Runs", lang) },
    { key: "cards", label: t("Cards", lang) },
    { key: "relics", label: t("Relics", lang) },
    { key: "potions", label: t("Potions", lang) },
    { key: "tierlists", label: t("Tier Lists", lang) },
  ];

  const topCards = (stats.top_cards || [])
    .filter((c) => !STARTER_CARDS.has(c.card_id))
    .slice(0, 10);
  const topRelics = (stats.top_relics || [])
    .filter((r) => !STARTER_RELICS.has(r.relic_id))
    .slice(0, 10);
  const topPotions = (stats.top_potions || [])
    .sort((a, b) => b.picked - a.picked)
    .slice(0, 10);
  const deadliest = (stats.deadliest || []).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tb.key
                ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t("Runs", lang)} value={stats.total_runs} />
            <StatCard label={t("Wins", lang)} value={stats.total_wins ?? 0} />
            <StatCard label={t("Win Rate", lang)} value={`${stats.win_rate ?? 0}%`} />
            <StatCard label={t("Abandoned", lang)} value={stats.total_abandoned ?? 0} />
          </div>

          {stats.characters && stats.characters.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Characters", lang)}</h3>
              <div className="space-y-2">
                {stats.characters.map((c) => {
                  const color = characterHex(c.character) || "var(--text-muted)";
                  const pct = stats.total_runs > 0 ? (c.total / stats.total_runs) * 100 : 0;
                  return (
                    <div key={c.character} className="flex items-center gap-3 text-sm">
                      <span className="w-24 font-medium" style={{ color }}>{displayName(c.character)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-8 text-right text-xs text-[var(--text-tertiary)] tabular-nums">{c.total}</span>
                      <span className="w-12 text-right text-xs tabular-nums" style={{ color }}>{c.win_rate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {bests && Object.keys(bests).length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Personal Bests", lang)}</h3>
              <div className="space-y-2">
                {([
                  ["fastest_solo", t("Fastest Solo", lang), bests.fastest_solo],
                  ["fastest_multi", t("Fastest Co-op", lang), bests.fastest_multi],
                  ["highest_ascension", t("Highest Ascension", lang), bests.highest_ascension],
                  ["todays_daily", t("Today’s Daily Climb", lang), bests.todays_daily],
                  ["fastest_daily", t("Fastest Daily (All Time)", lang), bests.fastest_daily],
                ] as [string, string, PersonalBest | undefined][]).map(([key, label, best]) => {
                  if (!best) return null;
                  const rank = competitive?.personal_ranks?.[key];
                  const isAsc = key === "highest_ascension";
                  return (
                    <Link key={key} href={`${lp}/runs/${best.run_hash}`} className="flex items-center justify-between text-sm hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 py-1 transition-colors">
                      <span className="text-[var(--text-secondary)]">{label}</span>
                      <span className="text-[var(--text-primary)] font-medium tabular-nums">
                        {isAsc ? `A${best.ascension}` : formatTime(best.run_time)}
                        <span className="text-[var(--text-tertiary)] ml-2 text-xs">
                          {displayName(best.character)}
                          {!isAsc && ` A${best.ascension}`}
                          {isAsc && ` ${formatTime(best.run_time)}`}
                        </span>
                        {rank && rank.rank && (
                          <span className="text-[var(--accent-gold)] ml-2 text-[10px]">
                            #{rank.rank.toLocaleString()}
                            <span className="text-[var(--text-muted)]"> of {rank.total.toLocaleString()}</span>
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's Daily Climb Leaderboard */}
          {competitive?.daily_leaderboard && competitive.daily_leaderboard.runs.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t("Today's Daily Climb", lang)}</h3>
                <span className="text-[10px] text-[var(--text-tertiary)]">{competitive.daily_leaderboard.total_today} {t("runs today", lang)}</span>
              </div>
              <div className="space-y-1">
                {competitive.daily_leaderboard.runs.map((entry, i) => (
                  <Link
                    key={entry.run_hash}
                    href={`${lp}/runs/${entry.run_hash}`}
                    className={`flex items-center gap-3 text-sm px-2 -mx-2 py-1.5 rounded transition-colors ${
                      entry.is_current_user
                        ? "bg-[var(--accent-gold)]/10 hover:bg-[var(--accent-gold)]/15"
                        : "hover:bg-[var(--bg-card-hover)]"
                    }`}
                  >
                    <span className="w-5 text-right text-xs text-[var(--text-tertiary)] tabular-nums">{i + 1}</span>
                    <span className={`flex-1 truncate ${entry.is_current_user ? "text-[var(--accent-gold)] font-medium" : "text-[var(--text-primary)]"}`}>
                      {entry.username || t("Anonymous", lang)}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: characterHex(entry.character) || "var(--text-tertiary)" }}>{displayName(entry.character)}</span>
                    <span className="text-xs text-[var(--text-primary)] tabular-nums font-medium">{formatTime(entry.run_time)}</span>
                  </Link>
                ))}
                {competitive.daily_leaderboard.user_rank && competitive.daily_leaderboard.user_rank > 10 && (
                  <>
                    <div className="text-center text-[var(--text-muted)] text-xs py-1">...</div>
                    <div className="flex items-center gap-3 text-sm px-2 -mx-2 py-1.5 rounded bg-[var(--accent-gold)]/10">
                      <span className="w-5 text-right text-xs text-[var(--text-tertiary)] tabular-nums">{competitive.daily_leaderboard.user_rank}</span>
                      <span className="flex-1 text-[var(--accent-gold)] font-medium">{t("You", lang)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Win Rate vs Community */}
          {competitive?.win_rate_comparison && competitive.win_rate_comparison.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Win Rate vs Community", lang)}</h3>
              <div className="space-y-3">
                {competitive.win_rate_comparison.map((c) => {
                  const color = characterHex(c.character) || "var(--text-muted)";
                  const delta = c.user_win_rate - c.community_win_rate;
                  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-[var(--text-muted)]";
                  return (
                    <div key={c.character} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium" style={{ color }}>{displayName(c.character)}</span>
                        <span className={`text-xs font-medium tabular-nums ${deltaColor}`}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-[10px] text-[var(--text-tertiary)]">{t("You", lang)}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(c.user_win_rate, 100)}%`, backgroundColor: color }} />
                          </div>
                          <span className="w-12 text-right text-[10px] tabular-nums text-[var(--text-primary)]">{c.user_win_rate}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-[10px] text-[var(--text-tertiary)]">{t("Avg", lang)}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                            <div className="h-full rounded-full opacity-40" style={{ width: `${Math.min(c.community_win_rate, 100)}%`, backgroundColor: color }} />
                          </div>
                          <span className="w-12 text-right text-[10px] tabular-nums text-[var(--text-tertiary)]">{c.community_win_rate}%</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">{c.user_wins}W / {c.user_total - c.user_wins}L across {c.user_total} runs</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {deadliest.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Deadliest Encounters", lang)}</h3>
              <div className="space-y-1.5">
                {deadliest.map((d) => (
                  <div key={d.encounter} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-primary)]">{displayName(d.encounter)}</span>
                    <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{d.count} {t("deaths", lang)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "runs" && (
        <div>
          {runsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-[var(--bg-card)] rounded animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-4">
              {t("No runs yet. Upload .run files to get started.", lang)}
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                {runs.map((run) => (
                  <div
                    key={run.run_hash}
                    className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm"
                  >
                    <span className="font-medium w-20 sm:w-24 truncate" style={{ color: characterHex(run.character) || "var(--text-primary)" }}>
                      {run.character}
                    </span>
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                      run.win
                        ? "bg-green-500/15 text-green-400"
                        : run.was_abandoned
                          ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-red-500/15 text-red-400"
                    }`}>
                      {run.win ? "W" : run.was_abandoned ? "A" : "L"}
                    </span>
                    <span className="text-[var(--text-tertiary)] text-xs hidden sm:inline">
                      A{run.ascension}
                    </span>
                    <span className="text-[var(--text-tertiary)] text-xs hidden sm:inline">
                      F{run.floors_reached}
                    </span>
                    <span className="flex-1" />
                    <Link
                      href={`/runs/${run.run_hash}`}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                    >
                      {t("View", lang)}
                    </Link>
                    {deleteConfirm === run.run_hash ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onDeleteRun(run.run_hash)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          {t("Confirm", lang)}
                        </button>
                        <button
                          onClick={() => onDeleteConfirm(null)}
                          className="text-xs text-[var(--text-tertiary)]"
                        >
                          {t("Cancel", lang)}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onDeleteConfirm(run.run_hash)}
                        className="text-xs text-[var(--text-tertiary)] hover:text-red-400 transition-colors shrink-0"
                      >
                        {t("Delete", lang)}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {runsTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => onPageChange((p: number) => Math.max(1, p - 1))}
                    disabled={runsPage <= 1}
                    className="px-3 py-1.5 text-sm rounded border border-[var(--border-subtle)] disabled:opacity-30"
                  >
                    {t("Prev", lang)}
                  </button>
                  <span className="text-sm text-[var(--text-tertiary)]">
                    {runsPage} / {runsTotalPages}
                  </span>
                  <button
                    onClick={() => onPageChange((p: number) => Math.min(runsTotalPages, p + 1))}
                    disabled={runsPage >= runsTotalPages}
                    className="px-3 py-1.5 text-sm rounded border border-[var(--border-subtle)] disabled:opacity-30"
                  >
                    {t("Next", lang)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "cards" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Most Used Cards", lang)}</h3>
          {topCards.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">{t("No card data yet.", lang)}</p>
          ) : (
            <div className="space-y-0.5">
              {topCards.map((c) => {
                const info = cardData[c.card_id];
                return (
                  <EntityRow
                    key={c.card_id}
                    name={info?.name || displayName(c.card_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${c.count} ${t("copies", lang)}`}
                    href={`${lp}/cards/${c.card_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "relics" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Most Used Relics", lang)}</h3>
          {topRelics.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">{t("No relic data yet.", lang)}</p>
          ) : (
            <div className="space-y-0.5">
              {topRelics.map((r) => {
                const info = relicData[r.relic_id];
                return (
                  <EntityRow
                    key={r.relic_id}
                    name={info?.name || displayName(r.relic_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${r.total_runs_with} ${t("runs", lang)}`}
                    href={`${lp}/relics/${r.relic_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "potions" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Most Picked Potions", lang)}</h3>
          {topPotions.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">{t("No potion data yet.", lang)}</p>
          ) : (
            <div className="space-y-0.5">
              {topPotions.map((p) => {
                const info = potionData[p.potion_id];
                return (
                  <EntityRow
                    key={p.potion_id}
                    name={info?.name || displayName(p.potion_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${p.pick_rate}% ${t("pick", lang)}`}
                    href={`${lp}/potions/${p.potion_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "tierlists" && (
        <div>
          <div className="mb-1 flex items-center justify-end">
            <Link
              href="/tier-list-maker"
              className="text-sm text-sky-400 hover:underline"
            >
              {t("New tier list", lang)}
            </Link>
          </div>
          <MyTierLists />
        </div>
      )}
    </div>
  );
}
