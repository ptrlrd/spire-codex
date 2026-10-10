"use client";

import KeyPicks, {
  type KeyBoss,
  type KeyCard,
} from "@/app/components/KeyPicks";
import { useT } from "@/lib/i18n";
import { useState, useEffect, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import MyTierLists from "@/app/[locale]/tier-list-maker/MyTierLists";
import ProfileInsights from "./ProfileInsights";
import { characterHex } from "@/lib/character-colors";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  characters?: {
    character: string;
    total: number;
    wins: number;
    win_rate: number;
  }[];
  top_cards?: {
    card_id: string;
    count: number;
    in_wins: number;
    total_runs_with: number;
    win_runs: number;
  }[];
  top_relics?: {
    relic_id: string;
    count: number;
    total_runs_with: number;
    win_runs: number;
  }[];
  top_potions?: {
    potion_id: string;
    offered: number;
    picked: number;
    used: number;
    pick_rate: number;
  }[];
  deadliest?: { encounter: string; count: number }[];
}

interface Run {
  run_hash: string;
  character: string;
  win: boolean;
  was_abandoned: boolean;
  ascension: number;
  floors_reached: number;
  submitted_at: string;
  key_cards?: KeyCard[];
  key_relics?: string[];
  last_bosses?: KeyBoss[];
  killed_by?: string | null;
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
  onDeleteRuns: (hashes: string[]) => Promise<void> | void;
  overviewExtra?: ReactNode;
  statsTab?: (tab: StatsTab) => ReactNode;
  chartsTab?: ReactNode;
  runsQuery: string;
  onRunsQueryChange: (q: string) => void;
}

const STATS_TABS = [
  "cards",
  "relics",
  "potions",
  "events",
  "shops",
  "campfires",
] as const;
export type StatsTab = (typeof STATS_TABS)[number];
type Tab = "overview" | "runs" | StatsTab | "charts" | "tierlists";

function isStatsTab(tab: Tab): tab is StatsTab {
  return (STATS_TABS as readonly string[]).includes(tab);
}

export default function ProfileStats({
  runs,
  runsTotal,
  runsLoading,
  runsPage,
  runsTotalPages,
  onPageChange,
  onDeleteRun,
  deleteConfirm,
  onDeleteConfirm,
  onDeleteRuns,
  overviewExtra,
  statsTab,
  chartsTab,
  runsQuery,
  onRunsQueryChange,
}: ProfileStatsProps) {
  const t = useT();
  // Bulk delete: selection is per page, so paging away clears it rather than
  // silently carrying hashes the user can no longer see.
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const pageHashes = runs.map((r) => r.run_hash).join(",");
  useEffect(() => {
    setSelected([]);
    setConfirmBulk(false);
  }, [pageHashes]);

  const toggleSelected = (hash: string) =>
    setSelected((prev) =>
      prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash],
    );
  const allSelected = runs.length > 0 && selected.length === runs.length;
  const someSelected = selected.length > 0 && !allSelected;
  const toggleAll = () =>
    setSelected(allSelected ? [] : runs.map((r) => r.run_hash));

  async function deleteSelected() {
    if (selected.length === 0) return;
    setBulkDeleting(true);
    try {
      await onDeleteRuns(selected);
      setSelected([]);
    } finally {
      setBulkDeleting(false);
      setConfirmBulk(false);
    }
  }
  const [stats, setStats] = useState<Stats | null>(null);
  const [bests, setBests] = useState<PersonalBests | null>(null);
  const [competitive, setCompetitive] = useState<CompetitiveData | null>(null);
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

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-20 bg-[var(--bg-card)] rounded-lg animate-pulse"
          />
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
    { key: "events", label: t("Events") },
    { key: "shops", label: t("Shops") },
    { key: "campfires", label: t("Campfires") },
    { key: "charts", label: t("Charts") },
    { key: "tierlists", label: t("Tier Lists") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 pb-3 sm:flex-nowrap sm:gap-1 sm:pb-0 sm:overflow-x-auto border-b border-[var(--border-subtle)]">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors sm:rounded-none sm:border-0 sm:border-b-2 sm:-mb-px sm:px-3 sm:py-2 sm:text-sm ${
              tab === tb.key
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] sm:bg-transparent"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] sm:border-transparent"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <ProfileInsights
            bests={bests}
            personalRanks={competitive?.personal_ranks}
          />
          {overviewExtra}
        </>
      )}

      {tab === "runs" && (
        <div>
          <div className="mb-3">
            <input
              type="text"
              value={runsQuery}
              onChange={(e) => onRunsQueryChange(e.target.value)}
              placeholder={t('Try: "{example}"', {
                example: "char:ironclad asc:10 relic:burning_blood",
              })}
              className="w-full text-sm px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
            />
            <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
              {t("Expressions:")} <code>char:ironclad</code>,{" "}
              <code>asc:10</code> {t("or")} <code>asc:3-7</code>,{" "}
              <code>card:bash,anger</code>, <code>relic:burning_blood</code>{" "}
              {t("(combine for AND)")}, <code>shop:orange_dough</code>{" "}
              {t("(bought at a shop: cards, relics, or potions)")},{" "}
              <code>version:v0.106.0</code> {t("or")}{" "}
              <code>version:v0.104.0-v0.106.0</code>, <code>seed:abc</code>,{" "}
              <code>mode:daily</code>, <code>result:win</code>,{" "}
              <code>players:single</code>
            </p>
          </div>
          {runsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-[var(--bg-card)] rounded animate-pulse"
                />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-4">
              {runsQuery.trim()
                ? t("No runs found.")
                : t("No runs yet. Upload .run files to get started.")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    disabled={bulkDeleting}
                    aria-label={t("Select every run on this page")}
                    className="accent-accent"
                  />
                  {t("Select all")}
                </label>
                {selected.length > 0 && (
                  <>
                    <span className="text-[var(--text-tertiary)]">
                      {t("{n} selected", { n: selected.length })}
                    </span>
                    {confirmBulk ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={deleteSelected}
                          disabled={bulkDeleting}
                          className="text-danger hover:text-danger disabled:opacity-50"
                        >
                          {bulkDeleting
                            ? t("Deleting...")
                            : t("Delete {n} runs", { n: selected.length })}
                        </button>
                        <button
                          onClick={() => setConfirmBulk(false)}
                          className="text-[var(--text-tertiary)]"
                        >
                          {t("Cancel")}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmBulk(true)}
                        className="text-[var(--text-tertiary)] hover:text-danger transition-colors"
                      >
                        {t("Delete selected")}
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                {runs.map((run) => (
                  <div
                    key={run.run_hash}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap sm:gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(run.run_hash)}
                      onChange={() => toggleSelected(run.run_hash)}
                      disabled={bulkDeleting}
                      aria-label={t(
                        "Select the {character} run that reached floor {floor}",
                        {
                          character: run.character,
                          floor: run.floors_reached,
                        },
                      )}
                      className="accent-accent shrink-0"
                    />
                    <span
                      className="font-medium w-20 sm:w-24 truncate"
                      style={{
                        color:
                          characterHex(run.character) || "var(--text-primary)",
                      }}
                    >
                      {run.character}
                    </span>
                    <span
                      className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                        run.win
                          ? "bg-success/15 text-success"
                          : run.was_abandoned
                            ? "bg-warning/15 text-warning"
                            : "bg-danger/15 text-danger"
                      }`}
                    >
                      {run.win ? "W" : run.was_abandoned ? "A" : "L"}
                    </span>
                    <span className="text-[var(--text-tertiary)] text-xs">
                      A{run.ascension}
                    </span>
                    <span className="text-[var(--text-tertiary)] text-xs">
                      F{run.floors_reached}
                    </span>
                    <span className="flex-1" />
                    <KeyPicks
                      cards={run.key_cards}
                      relics={run.key_relics}
                      bosses={run.last_bosses}
                      killedBy={run.killed_by}
                      className="order-last basis-full pl-6 sm:order-none sm:basis-auto sm:pl-0"
                    />
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
                          className="text-xs text-danger hover:text-danger"
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
                        className="text-xs text-[var(--text-tertiary)] hover:text-danger transition-colors shrink-0"
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
                    onClick={() =>
                      onPageChange((p: number) => Math.max(1, p - 1))
                    }
                    disabled={runsPage <= 1}
                    className="px-3 py-1.5 text-sm rounded border border-[var(--border-subtle)] disabled:opacity-30"
                  >
                    {t("Prev")}
                  </button>
                  <span className="text-sm text-[var(--text-tertiary)]">
                    {runsPage} / {runsTotalPages}
                  </span>
                  <button
                    onClick={() =>
                      onPageChange((p: number) =>
                        Math.min(runsTotalPages, p + 1),
                      )
                    }
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

      {isStatsTab(tab) && statsTab?.(tab)}

      {tab === "charts" && chartsTab}

      {tab === "tierlists" && (
        <div>
          <div className="mb-1 flex items-center justify-end">
            <Link
              prefetch={false}
              href="/tier-list-maker"
              className="text-sm text-info hover:underline"
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
