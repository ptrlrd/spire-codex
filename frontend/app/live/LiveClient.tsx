"use client";

// Live roster: who is in a run with the SpireCodex mod right now.
// /api/presence/active gives identity + progress (heartbeats every ~30s,
// 90s Mongo TTL); /api/presence/{steam_id} adds each player's deck and
// relics. Contract: markdown-docs/live-presence.md.
//
// Deliberately unlisted for now (noindex, no nav link, out of the search
// palette and sitemap) but viewable by anyone with the URL. The presence
// API only ever contains players who opted into sharing.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import {
  CardPill,
  RelicPill,
  cleanId,
  displayName,
  type CardInfo,
  type RelicInfo,
} from "../runs/[hash]/RunPills";
import {
  API,
  CharacterIcon,
  FightingChip,
  LiveDot,
  elapsed,
  parseDeckId,
  useMonsterMap,
  usePoll,
  type LivePlayer,
  type MonsterMap,
} from "./live-shared";

// The roster carries no ticker events, so the contract's 10-15s roster
// guidance applies here rather than the hot 3-5s per-player cadence.
const POLL_MS = 12_000;
const RECENT_CARDS = 5;

function PlayerCard({
  p,
  cardData,
  relicData,
  monsters,
  lp,
  lang,
}: {
  p: LivePlayer;
  cardData: Record<string, CardInfo>;
  relicData: Record<string, RelicInfo>;
  monsters: MonsterMap;
  lp: string;
  lang: string;
}) {
  const hpPct =
    p.hp != null && p.max_hp ? Math.max(0, Math.min(100, (p.hp / p.max_hp) * 100)) : null;
  // Newest acquisitions last in the deck array; show them newest-first.
  const recent = (p.deck ?? []).slice(-RECENT_CARDS).reverse();

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 hover:border-[var(--border-accent)] transition-colors">
      <div className="flex items-center gap-3">
        <Link href={`/live/${p.steam_id}`} className="shrink-0">
          <CharacterIcon character={p.character} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LiveDot />
            <Link
              href={`/live/${p.steam_id}`}
              className="font-semibold text-[var(--text-primary)] truncate hover:text-[var(--accent-gold)] transition-colors"
            >
              {p.username || "Anonymous climber"}
            </Link>
            {p.ascension != null && p.ascension > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30">
                A{p.ascension}
              </span>
            )}
            {(p.player_count ?? 1) > 1 && (
              <span className="text-[10px] text-[var(--text-muted)]">co-op ×{p.player_count}</span>
            )}
          </div>
          <div className="text-xs text-[var(--text-muted)] truncate">
            {displayName(`CHARACTER.${p.character ?? ""}`)}
            {p.screen ? ` · ${p.screen}` : ""}
            {p.started_at ? ` · climbing for ${elapsed(p.started_at)}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
            {p.act != null ? `Act ${p.act}` : ""}
            {p.total_floor != null ? ` · F${p.total_floor}` : ""}
          </div>
          <div className="text-xs text-[var(--text-muted)] tabular-nums">
            {p.gold != null ? `${p.gold} gold` : ""}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <FightingChip p={p} monsters={monsters} />
        <Link
          href={`/live/${p.steam_id}`}
          className="ml-auto text-xs text-[var(--accent-gold)] hover:underline whitespace-nowrap"
        >
          Watch live →
        </Link>
      </div>

      {hpPct != null && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1 tabular-nums">
            <span>HP</span>
            <span>
              {p.hp}/{p.max_hp}
            </span>
          </div>
          <div className="h-1.5 rounded bg-[var(--bg-primary)]">
            <div className="h-1.5 rounded bg-rose-500" style={{ width: `${hpPct}%` }} />
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Latest cards
          </div>
          <div className="flex gap-1.5">
            {recent.map((raw, i) => {
              const { id, upgraded } = parseDeckId(raw);
              const fallback = cardData[id]?.image_url
                ? imageUrl(cardData[id].image_url as string)
                : "";
              return (
                <CardPill
                  key={`${raw}-${i}`}
                  cardId={id}
                  upgraded={upgraded}
                  cardData={cardData}
                  lp={lp}
                  className="block w-12 shrink-0"
                >
                  <img
                    src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                    alt={cardData[id]?.name || displayName(`CARD.${id}`)}
                    className="w-12 h-auto rounded-sm"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      if (fallback && el.src !== fallback) el.src = fallback;
                      else el.style.visibility = "hidden";
                    }}
                  />
                </CardPill>
              );
            })}
          </div>
        </div>
      )}

      {(p.relics ?? []).length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Relics
          </div>
          <div className="flex flex-wrap gap-1">
            {(p.relics ?? []).map((raw, i) => {
              const rid = cleanId(raw);
              const info = relicData[rid];
              const src = info?.image_url
                ? imageUrl(info.image_url)
                : imageUrl(`/static/images/relics/${rid.toLowerCase()}.png`);
              return (
                <RelicPill
                  key={`${raw}-${i}`}
                  relicId={rid}
                  relicData={relicData}
                  lp={lp}
                  className="block shrink-0"
                >
                  <img
                    src={src}
                    alt={info?.name || displayName(`RELIC.${raw}`)}
                    className="w-7 h-7 object-contain"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </RelicPill>
              );
            })}
          </div>
        </div>
      )}

      {p.sts2_version && (
        <div className="mt-3 text-[10px] text-[var(--text-muted)]">{p.sts2_version}</div>
      )}
    </div>
  );
}

export default function LiveClient() {
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const [players, setPlayers] = useState<LivePlayer[] | null>(null);
  const [stale, setStale] = useState(false);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const monsters = useMonsterMap(
    (players ?? []).some((p) => p.screen === "combat" && (p.fighting?.length ?? 0) > 0),
  );

  useEffect(() => {
    cachedFetch<CardInfo[]>(`${API}/api/cards?lang=${lang}`)
      .then((cards) => {
        const m: Record<string, CardInfo> = {};
        for (const c of cards) m[c.id] = c;
        setCardData(m);
      })
      .catch(() => {});
    cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`)
      .then((relics) => {
        const m: Record<string, RelicInfo> = {};
        for (const r of relics) m[r.id] = r;
        setRelicData(m);
      })
      .catch(() => {});
  }, [lang]);

  usePoll(async () => {
    try {
      const r = await fetch(`${API}/api/presence/active`);
      if (!r.ok) throw new Error(`active ${r.status}`);
      const data: { players?: LivePlayer[] } = await r.json();
      const roster = data.players ?? [];
      // The roster is identity + progress only; deck/relics live on the
      // per-player doc. The list is small, so fetch them all in parallel
      // and fall back to the roster entry if one fetch fails.
      const detailed = await Promise.all(
        roster.map(async (p) => {
          try {
            const dr = await fetch(`${API}/api/presence/${p.steam_id}`);
            if (!dr.ok) return p;
            return { ...p, ...(await dr.json()) } as LivePlayer;
          } catch {
            return p;
          }
        }),
      );
      setPlayers(detailed);
      setStale(false);
    } catch {
      setStale(true);
      setPlayers((prev) => prev ?? []);
    }
  }, POLL_MS);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">Live now</span>
        </h1>
        {players !== null && players.length > 0 && <LiveDot />}
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Players in a run with the mod right now · refreshes every {POLL_MS / 1000}s
        {stale ? " · last refresh failed, retrying" : ""}
      </p>

      {players === null && (
        <p className="text-sm text-[var(--text-muted)]">Loading the roster...</p>
      )}
      {players !== null && players.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          Nobody is climbing right now. The roster updates on its own.
        </p>
      )}
      {players !== null && players.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {players.map((p) => (
            <PlayerCard
              key={p.steam_id}
              p={p}
              cardData={cardData}
              relicData={relicData}
              monsters={monsters}
              lp={lp}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}
