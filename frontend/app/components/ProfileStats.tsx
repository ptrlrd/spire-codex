"use client";

import { useT } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import MyTierLists from "@/app/[locale]/tier-list-maker/MyTierLists";
import ProfileInsights from "./ProfileInsights";
import { characterHex } from "@/lib/character-colors";

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

function displayName(id: string): string {
  return id
    .replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function EntityRow({ name, imageSrc, stat, href }: { name: string; imageSrc: string | null; stat: string; href: string }) {
  return (
    <Link prefetch={false} href={href} className="flex items-center gap-3 py-1.5 hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 transition-colors">
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
  const t = useT();
  const bp = useBetaPrefix();
  const [stats, setStats] = useState<Stats | null>(null);
  const [bests, setBests] = useState<PersonalBests | null>(null);
  const [competitive, setCompetitive] = useState<CompetitiveData | null>(null);
  const [cardData, setCardData] = useState<Record<string, EntityInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, EntityInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, EntityInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    // Progressive load: each piece renders as it arrives instead of the whole
    // panel blanking on a skeleton until the slowest endpoint (/competitive,
    // a dozen Mongo queries) returns. The headline stats paint first.
    let alive = true;

    fetch(`${API}/api/auth/stats`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d) setStats(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });

    fetch(`${API}/api/auth/personal-bests`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setBests(d))
      .catch(() => {});

    fetch(`${API}/api/auth/competitive`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setCompetitive(d))
      .catch(() => {});

    cachedFetch<EntityInfo[]>(`${API}/api/cards`)
      .then((cards) => {
        if (!alive) return;
        const cm: Record<string, EntityInfo> = {};
        for (const c of cards) cm[c.id] = c;
        setCardData(cm);
      })
      .catch(() => {});
    cachedFetch<EntityInfo[]>(`${API}/api/relics`)
      .then((relics) => {
        if (!alive) return;
        const rm: Record<string, EntityInfo> = {};
        for (const r of relics) rm[r.id] = r;
        setRelicData(rm);
      })
      .catch(() => {});
    cachedFetch<EntityInfo[]>(`${API}/api/potions`)
      .then((potions) => {
        if (!alive) return;
        const pm: Record<string, EntityInfo> = {};
        for (const p of potions) pm[p.id] = p;
        setPotionData(pm);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
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
        {t("No stats yet. Upload runs to see your personal stats here.")}
      </p>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview") },
    { key: "runs", label: t("Runs") },
    { key: "cards", label: t("Cards") },
    { key: "relics", label: t("Relics") },
    { key: "potions", label: t("Potions") },
    { key: "tierlists", label: t("Tier Lists") },
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
        <ProfileInsights
          bests={bests}
          personalRanks={competitive?.personal_ranks}
        />
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
              {t("No runs yet. Upload .run files to get started.")}
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
                      prefetch={false}
                      href={`/runs/${run.run_hash}`}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                    >
                      {t("View")}
                    </Link>
                    {deleteConfirm === run.run_hash ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onDeleteRun(run.run_hash)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          {t("Confirm")}
                        </button>
                        <button
                          onClick={() => onDeleteConfirm(null)}
                          className="text-xs text-[var(--text-tertiary)]"
                        >
                          {t("Cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onDeleteConfirm(run.run_hash)}
                        className="text-xs text-[var(--text-tertiary)] hover:text-red-400 transition-colors shrink-0"
                      >
                        {t("Delete")}
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
                    {t("Prev")}
                  </button>
                  <span className="text-sm text-[var(--text-tertiary)]">
                    {runsPage} / {runsTotalPages}
                  </span>
                  <button
                    onClick={() => onPageChange((p: number) => Math.min(runsTotalPages, p + 1))}
                    disabled={runsPage >= runsTotalPages}
                    className="px-3 py-1.5 text-sm rounded border border-[var(--border-subtle)] disabled:opacity-30"
                  >
                    {t("Next")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "cards" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Most Used Cards")}</h3>
          {topCards.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">{t("No card data yet.")}</p>
          ) : (
            <div className="space-y-0.5">
              {topCards.map((c) => {
                const info = cardData[c.card_id];
                return (
                  <EntityRow
                    key={c.card_id}
                    name={info?.name || displayName(c.card_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${c.count} ${t("copies")}`}
                    href={`${bp}/cards/${c.card_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "relics" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Most Used Relics")}</h3>
          {topRelics.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">{t("No relic data yet.")}</p>
          ) : (
            <div className="space-y-0.5">
              {topRelics.map((r) => {
                const info = relicData[r.relic_id];
                return (
                  <EntityRow
                    key={r.relic_id}
                    name={info?.name || displayName(r.relic_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${r.total_runs_with} ${t("runs")}`}
                    href={`${bp}/relics/${r.relic_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "potions" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t("Most Picked Potions")}</h3>
          {topPotions.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">{t("No potion data yet.")}</p>
          ) : (
            <div className="space-y-0.5">
              {topPotions.map((p) => {
                const info = potionData[p.potion_id];
                return (
                  <EntityRow
                    key={p.potion_id}
                    name={info?.name || displayName(p.potion_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${p.pick_rate}% ${t("pick")}`}
                    href={`${bp}/potions/${p.potion_id.toLowerCase()}`}
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
              prefetch={false}
              href="/tier-list-maker"
              className="text-sm text-sky-400 hover:underline"
            >
              {t("New tier list")}
            </Link>
          </div>
          <MyTierLists />
        </div>
      )}
    </div>
  );
}
