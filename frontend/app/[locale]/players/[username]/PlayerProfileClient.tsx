"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { EMPTY_INSIGHT_FILTERS, InsightsFilterBar, InsightsPanels, insightFilterQuery, useCardMap, useRelicMap, type InsightFilters, type Insights } from "@/app/components/ProfileInsights";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type PlayerInsights = Insights & { username?: string; total_wins?: number; win_rate?: number };

export default function PlayerProfileClient({ username }: { username: string }) {
  const lang = useGameLocale();
  const t = useT();
  const [data, setData] = useState<PlayerInsights | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [building, setBuilding] = useState(false);
  const [claimedRuns, setClaimedRuns] = useState<number | null>(null);
  const [filters, setFilters] = useState<InsightFilters>(EMPTY_INSIGHT_FILTERS);
  const cards = useCardMap();
  const relics = useRelicMap();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const q = insightFilterQuery(filters);
    // First-ever view of a profile kicks a background walk server-side;
    // poll until it lands instead of waiting on one long request.
    const load = () => {
      fetch(`${API}/api/players/${encodeURIComponent(username)}/insights${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return;
          if (d && d.building) {
            setBuilding(true);
            if (typeof d.claimed_runs === "number") setClaimedRuns(d.claimed_runs);
            timer = setTimeout(load, 5000);
            return;
          }
          setBuilding(false);
          if (d) setData(d);
          setStatus(d ? "ok" : "missing");
        })
        .catch(() => alive && setStatus("missing"));
    };
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [username, filters]);

  if (!data && (status === "loading" || building)) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-3">
        <div className="h-8 w-56 bg-[var(--bg-card)] rounded animate-pulse" />
        {building && (
          <p className="text-sm text-[var(--text-secondary)]">
            {t("Crunching your runs. The first load can take a minute or two.")}
            {claimedRuns ? ` · ${claimedRuns.toLocaleString()} ${t("runs")}` : ""}
          </p>
        )}
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[var(--bg-card)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (status === "missing" || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">{username}</h1>
        <p className="text-[var(--text-secondary)]">{t("Player not found, or this profile is private.")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
            {data.username || username}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {data.total_runs} {t("runs")}
            {data.win_rate != null ? ` · ${data.win_rate}% ${t("win rate")}` : ""}
            {" · "}
            {t("Compared with all community-submitted runs.")}
          </p>
        </div>
        <InsightsFilterBar value={filters} onChange={setFilters} lang={lang} />
      </div>
      {building && (
        <p className="text-sm text-[var(--text-secondary)]">
          {t("Crunching your runs. The first load can take a minute or two.")}
        </p>
      )}
      {data.runs_walked ? (
        <InsightsPanels data={data} cards={cards} relics={relics} lang={lang} />
      ) : (
        <p className="text-sm text-[var(--text-secondary)] py-4">{t("Not enough data yet.")}</p>
      )}
    </div>
  );
}
