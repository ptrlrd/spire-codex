"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CharacterRow {
  character: string;
  picks: number;
  wins: number;
  win_rate: number;
}

interface EntityStats {
  entity_type: string;
  entity_id: string;
  picks: number;
  wins: number;
  win_rate: number;
  pick_rate: number;
  total_runs: number;
  by_character: CharacterRow[];
  last_submitted_at: string | null;
  last_run_hash: string | null;
}

interface Props {
  entityType: "relics" | "cards" | "potions";
  entityId: string;
  /** Display name for the prose summary (e.g. "Sozu", "Strike"). */
  entityName: string;
}

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
 * "Stats" tab content — community-run aggregates for one entity.
 * Layout: factual prose summary on top (doubles as SEO body content),
 * full per-character breakdown table below. Renders a graceful empty
 * state when the entity has no submitted runs yet so SEO crawlers
 * still see something other than spinners.
 */
export default function EntityRunStats({ entityType, entityId, entityName }: Props) {
  const [stats, setStats] = useState<EntityStats | null>(null);

  useEffect(() => {
    cachedFetch<EntityStats>(`${API}/api/runs/stats/${entityType}/${entityId}`).then(setStats);
  }, [entityType, entityId]);

  if (!stats) {
    return <p className="text-sm text-[var(--text-muted)]">Loading run stats…</p>;
  }

  const empty = stats.picks === 0;
  const top = stats.by_character[0];
  const last = relativeTime(stats.last_submitted_at);
  const maxCharPicks = top?.picks ?? 0;

  return (
    <div className="space-y-5">
      {/* Prose summary — also serves as crawlable SEO body content. */}
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
            <strong className="text-[var(--text-primary)]">{stats.win_rate}%</strong> win
            rate across <strong>{stats.picks.toLocaleString()}</strong> picks
            {top && (
              <>
                . Most often taken by{" "}
                <strong className="text-[var(--text-primary)]">
                  {characterPretty(top.character)}
                </strong>{" "}
                players ({top.picks.toLocaleString()} picks ·{" "}
                {Math.round((top.picks / stats.picks) * 100)}% share)
              </>
            )}
            . Last picked <strong>{last}</strong>
            {stats.last_run_hash && (
              <>
                {" "}in run{" "}
                <Link
                  href={`/runs/shared/${stats.last_run_hash}`}
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

      {/* Per-character breakdown table — hidden when empty. */}
      {!empty && stats.by_character.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Picks by character
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 pr-3 font-semibold">Character</th>
                  <th className="text-right py-2 px-3 font-semibold">Picks</th>
                  <th className="text-right py-2 px-3 font-semibold">Win Rate</th>
                  <th className="text-left py-2 pl-3 font-semibold w-1/3">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_character.map((row) => {
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
        Stats reflect community-submitted runs only and refresh every 30 minutes.
        {stats.total_runs > 0 && (
          <>
            {" "}Pick rate: <strong>{stats.pick_rate}%</strong> of {stats.total_runs.toLocaleString()} tracked runs.
          </>
        )}
      </p>
    </div>
  );
}
