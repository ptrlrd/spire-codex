"use client";

// "Live now" strip for the home page: who is in a run with the mod right
// now, with a "Fighting X" enemy portrait when they're mid-combat. Renders
// nothing at all (zero layout footprint) until the roster has somebody in
// it, so the home page is unchanged whenever nobody is climbing.

import { useState } from "react";
import Link from "next/link";
import {
  API,
  CharacterIcon,
  FightingChip,
  LiveDot,
  useMonsterMap,
  usePoll,
  type LivePlayer,
} from "@/app/live/live-shared";

const POLL_MS = 15_000;
const MAX_SHOWN = 6;

export default function LiveNowRail() {
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const monsters = useMonsterMap(
    players.some((p) => p.screen === "combat" && (p.fighting?.length ?? 0) > 0),
  );

  usePoll(async () => {
    try {
      const r = await fetch(`${API}/api/presence/active?limit=${MAX_SHOWN + 6}`);
      if (!r.ok) return;
      const data: { players?: LivePlayer[] } = await r.json();
      setPlayers(data.players ?? []);
    } catch {
      // Keep the last roster on a blip; the strip ages out naturally
      // because entries vanish from the API within 90s of a quit.
    }
  }, POLL_MS);

  if (players.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <LiveDot />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Live now
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            {players.length} {players.length === 1 ? "player" : "players"} climbing
          </span>
          <Link
            href="/live"
            className="ml-auto text-xs text-[var(--accent-gold)] hover:underline whitespace-nowrap"
          >
            Watch all →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {players.slice(0, MAX_SHOWN).map((p) => (
            <Link
              key={p.steam_id}
              href={`/live/${p.steam_id}`}
              className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-accent)] transition-colors max-w-full"
            >
              <CharacterIcon character={p.character} className="w-7 h-7" />
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                {p.username || "Anonymous climber"}
              </span>
              {p.total_floor != null && (
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                  F{p.total_floor}
                </span>
              )}
              <FightingChip p={p} monsters={monsters} circle="w-5 h-5" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
