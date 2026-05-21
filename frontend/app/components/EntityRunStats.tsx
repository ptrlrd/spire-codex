"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import ScoreBadge from "@/app/components/ScoreBadge";

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
  baseline_win_rate: number;
  score: number | null;
  by_character: CharacterRow[];
  last_submitted_at: string | null;
  last_run_hash: string | null;
}

interface SynergyRow {
  card_id: string;
  co_runs: number;
}

interface CardStats {
  card_id: string;
  n_runs_with_card: number;
  n_wins_with_card: number;
  win_rate_when_in_deck: number | null;
  n_offered: number;
  n_picked: number;
  pick_rate: number | null;
  skip_rate: number | null;
  avg_copies_winning: number | null;
  avg_copies_all: number | null;
  upgrade_rate: number | null;
  avg_ascension_picked: number | null;
  top_synergies: SynergyRow[];
}

function prettyId(id: string): string {
  // CARD_ID like "STRIKE_IRONCLAD" → "Strike Ironclad". Cheap title-case
  // without a name-lookup round-trip.
  return id
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
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

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
        {label}
      </div>
      <div className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  );
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
  const [cardStats, setCardStats] = useState<CardStats | null>(null);

  useEffect(() => {
    cachedFetch<EntityStats>(`${API}/api/runs/stats/${entityType}/${entityId}`).then(setStats);
    // Card detail pages get an additional richer aggregate (pick/skip, copies,
    // synergies). Relics/potions have less interesting per-entity data so we
    // skip the round-trip for them. Non-card entityType doesn't reset
    // cardStats — the render block is gated on entityType === "cards" anyway,
    // and the conditional setState would trip react-hooks/set-state-in-effect.
    if (entityType === "cards") {
      cachedFetch<CardStats>(`${API}/api/runs/card-stats/${entityId}`).then(setCardStats);
    }
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
      {/* Codex Score hero — single 0-100 badge that summarizes the
          entity's community-meta strength. Bayesian-shrunk so low-N
          entities sit near neutral instead of saturating S/F tiers.
          See `_compute_score` in run_entity_stats.py for the formula. */}
      {stats.score != null && (
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-subtle)]">
          <ScoreBadge score={stats.score} size="lg" showNumber />
          <div className="text-xs text-[var(--text-muted)] leading-snug">
            <div className="text-[var(--text-secondary)] font-semibold mb-0.5">
              Codex Score
            </div>
            <div>
              {stats.win_rate}% win rate vs {stats.baseline_win_rate}% baseline
              {" · "}
              <Link
                href="/leaderboards/scoring"
                className="text-[var(--accent-gold)]/80 hover:text-[var(--accent-gold)] hover:underline"
              >
                how is this calculated?
              </Link>
            </div>
          </div>
        </div>
      )}

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

      {/* Card-specific aggregates: pick/skip rates, copies in winning decks,
          upgrade rate, ascension trend, and top synergy cards from winning
          decks. Only rendered for entityType==="cards" and only when we have
          enough samples to be useful. */}
      {entityType === "cards" && cardStats && cardStats.n_runs_with_card > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Card stats
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {cardStats.pick_rate != null && (
              <StatTile
                label="Pick rate when offered"
                value={`${Math.round(cardStats.pick_rate * 100)}%`}
                sub={`${cardStats.n_picked.toLocaleString()} / ${cardStats.n_offered.toLocaleString()}`}
              />
            )}
            {cardStats.skip_rate != null && (
              <StatTile
                label="Skip rate"
                value={`${Math.round(cardStats.skip_rate * 100)}%`}
              />
            )}
            {cardStats.win_rate_when_in_deck != null && (
              <StatTile
                label="Win rate when in deck"
                value={`${Math.round(cardStats.win_rate_when_in_deck * 100)}%`}
                sub={`${cardStats.n_wins_with_card.toLocaleString()} / ${cardStats.n_runs_with_card.toLocaleString()} runs`}
              />
            )}
            {cardStats.avg_copies_winning != null && (
              <StatTile
                label="Avg copies (winning)"
                value={cardStats.avg_copies_winning.toFixed(2)}
                sub={
                  cardStats.avg_copies_all != null
                    ? `vs ${cardStats.avg_copies_all.toFixed(2)} overall`
                    : undefined
                }
              />
            )}
            {cardStats.upgrade_rate != null && (
              <StatTile
                label="Upgrade rate"
                value={`${Math.round(cardStats.upgrade_rate * 100)}%`}
              />
            )}
            {cardStats.avg_ascension_picked != null && (
              <StatTile
                label="Avg ascension picked at"
                value={cardStats.avg_ascension_picked.toFixed(1)}
              />
            )}
          </div>

          {cardStats.top_synergies.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 mt-4">
                Most paired with (winning decks)
              </h4>
              <ul className="space-y-1 text-sm">
                {cardStats.top_synergies.map((s) => (
                  <li
                    key={s.card_id}
                    className="flex items-center justify-between border-b border-[var(--border-subtle)] last:border-b-0 py-1.5"
                  >
                    <Link
                      href={`/cards/${s.card_id.toLowerCase()}`}
                      className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:underline"
                    >
                      {prettyId(s.card_id)}
                    </Link>
                    <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums">
                      {s.co_runs.toLocaleString()} winning runs
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
