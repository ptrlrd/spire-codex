"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/ui-translations";
import { characterHex } from "@/lib/character-colors";
import type { CommunityStats } from "./HomeStatsSection";

const POLL_MS = 20_000;

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

const ENGLISH_CHARACTER_LABELS: Record<string, string> = {
  IRONCLAD: "Ironclad",
  SILENT: "Silent",
  DEFECT: "Defect",
  NECROBINDER: "Necrobinder",
  REGENT: "Regent",
};

function characterLabel(c: string, names?: Record<string, string>): string {
  return names?.[c.toLowerCase()] ?? ENGLISH_CHARACTER_LABELS[c] ?? c.charAt(0) + c.slice(1).toLowerCase();
}

function winRateColor(pct: number): string {
  if (pct >= 30) return "#22c55e";
  if (pct >= 15) return "#84cc16";
  if (pct >= 5) return "#eab308";
  return "#ef4444";
}

export default function HomeStatsLive({
  initialStats,
  langPrefix = "",
  lang = "eng",
  characterNames,
  runsHost,
  pollBase,
}: {
  initialStats: CommunityStats;
  langPrefix?: string;
  lang?: string;
  characterNames?: Record<string, string>;
  runsHost: string;
  pollBase: string;
}) {
  const [stats, setStats] = useState<CommunityStats>(initialStats);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      fetch(`${pollBase}/api/runs/stats`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d?.total_runs) setStats(d as CommunityStats);
        })
        .catch(() => null);
    };
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pollBase]);

  const losses = (stats.total_runs || 0) - (stats.total_wins || 0) - (stats.total_abandoned || 0);
  const maxWinRate = Math.max(1, ...stats.characters.map((c) => c.win_rate));
  const mostPlayed = stats.characters.length
    ? stats.characters.reduce((a, b) => (b.total > a.total ? b : a))
    : null;

  return (
    <div className="rvmp">
      <section className="hb">
        <section className="panel">
          <div className="s-head">
            <span className="s-kick">{t("Overview", lang)}</span>
            <h2>{t("Stats", lang)}</h2>
            <Link className="viewmore" href={`${runsHost}${langPrefix}/leaderboards/stats`}>
              {t("View all stats", lang)} {ARROW}
            </Link>
          </div>

          <div className="statgrid five">
            <div className="stat">
              <span className="stat-v">{stats.total_runs}</span>
              <span className="stat-k">{t("Runs", lang)}</span>
            </div>
            <div className="stat">
              <span className="stat-v" style={{ color: "var(--good)" }}>{stats.total_wins}</span>
              <span className="stat-k">{t("Wins", lang)}</span>
            </div>
            <div className="stat">
              <span className="stat-v" style={{ color: "var(--warn)" }}>{losses}</span>
              <span className="stat-k">{t("Losses", lang)}</span>
            </div>
            <div className="stat">
              <span className="stat-v">{stats.win_rate}%</span>
              <span className="stat-k">{t("Win %", lang)}</span>
            </div>
            <div className="stat">
              <span
                className="stat-v"
                style={{ color: mostPlayed ? characterHex(mostPlayed.character) || "var(--gold)" : "var(--text-3)" }}
                title={mostPlayed ? characterLabel(mostPlayed.character, characterNames) : ""}
              >
                {mostPlayed ? characterLabel(mostPlayed.character, characterNames) : "—"}
              </span>
              <span className="stat-k">{t("Most Played", lang)}</span>
            </div>
          </div>

          {stats.characters.length > 0 && (
            <div>
              <div className="wr-title">{t("Character Win Rates", lang)}</div>
              {stats.characters.map((c) => {
                const charColor = characterHex(c.character) || "var(--text-3)";
                const relPct = (c.win_rate / maxWinRate) * 100;
                return (
                  <div key={c.character} className="wr-row wr-stat">
                    <span className="wr-name" style={{ color: charColor }}>
                      {characterLabel(c.character, characterNames)}
                    </span>
                    <span className="wr-track">
                      <span className="wr-fill" style={{ width: `${relPct}%`, background: charColor }} />
                    </span>
                    <span className="wr-wl">
                      {c.wins}W / {c.total - c.wins}L
                    </span>
                    <span className="wr-num" style={{ color: winRateColor(c.win_rate) }}>
                      {c.win_rate}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
