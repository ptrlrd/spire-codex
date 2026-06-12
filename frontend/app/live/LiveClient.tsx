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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_MS = 20_000;
const RECENT_CARDS = 5;

interface LivePlayer {
  steam_id: string;
  username?: string | null;
  character?: string | null;
  ascension?: number | null;
  act?: number | null;
  act_floor?: number | null;
  total_floor?: number | null;
  hp?: number | null;
  max_hp?: number | null;
  gold?: number | null;
  screen?: string | null;
  player_count?: number | null;
  sts2_version?: string | null;
  started_at?: string | null;
  deck?: string[];
  relics?: string[];
}

function elapsed(startedAt?: string | null): string {
  if (!startedAt) return "";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Deck entries use the run-doc convention: bare card id, `+` = upgraded.
function parseDeckId(raw: string): { id: string; upgraded: boolean } {
  const upgraded = raw.endsWith("+");
  return { id: cleanId(upgraded ? raw.slice(0, -1) : raw), upgraded };
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  );
}

function PlayerCard({
  p,
  cardData,
  relicData,
  lp,
  lang,
}: {
  p: LivePlayer;
  cardData: Record<string, CardInfo>;
  relicData: Record<string, RelicInfo>;
  lp: string;
  lang: string;
}) {
  const charSlug = cleanId(p.character || "").toLowerCase();
  const charIcon = imageUrl(`/static/images/characters/character_icon_${charSlug}.webp`);
  const hpPct =
    p.hp != null && p.max_hp ? Math.max(0, Math.min(100, (p.hp / p.max_hp) * 100)) : null;
  // Newest acquisitions last in the deck array; show them newest-first.
  const recent = (p.deck ?? []).slice(-RECENT_CARDS).reverse();

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-3">
        {charSlug && (
          <Link href={`${lp}/characters/${charSlug}`} className="shrink-0">
            <img
              src={charIcon}
              alt={displayName(`CHARACTER.${p.character ?? ""}`)}
              className="w-12 h-12 object-contain"
              crossOrigin="anonymous"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LiveDot />
            <span className="font-semibold text-[var(--text-primary)] truncate">
              {p.username || "Anonymous climber"}
            </span>
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

  useEffect(() => {
    cachedFetch<CardInfo[]>(`${API}/api/cards?lang=${lang}`).then((cards) => {
      const m: Record<string, CardInfo> = {};
      for (const c of cards) m[c.id] = c;
      setCardData(m);
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`).then((relics) => {
      const m: Record<string, RelicInfo> = {};
      for (const r of relics) m[r.id] = r;
      setRelicData(m);
    });
  }, [lang]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
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
        if (!cancelled) {
          setPlayers(detailed);
          setStale(false);
        }
      } catch {
        if (!cancelled) {
          setStale(true);
          setPlayers((prev) => prev ?? []);
        }
      }
    }

    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

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
              lp={lp}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}
