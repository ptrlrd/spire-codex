"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "../components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CardInfo {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  cost: number;
  image_url: string | null;
}

interface RelicInfo {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_url: string | null;
}

interface CommunityStats {
  total_runs: number;
  total_wins: number;
  win_rate: number;
  characters: { character: string; total: number; wins: number; win_rate: number }[];
  ascensions: { level: number; total: number; wins: number; win_rate: number }[];
  top_cards: { card_id: string; count: number }[];
  win_cards: { card_id: string; count: number }[];
  pick_rates: { card_id: string; offered: number; picked: number; pick_rate: number }[];
  top_relics: { relic_id: string; count: number }[];
  deadliest: { encounter: string; count: number }[];
}

function displayName(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT)\./, "")
    .replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CardPill({ cardId, cardData, lp, className }: {
  cardId: string; cardData: Record<string, CardInfo>; lp: string; className?: string;
}) {
  const [show, setShow] = useState(false);
  const info = cardData[cardId];
  return (
    <Link href={`${lp}/cards/${cardId.toLowerCase()}`} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {info?.name || displayName(`CARD.${cardId}`)}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${API}${info.image_url}`} alt="" className="w-10 h-10 object-cover rounded" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.type} · {info.rarity} · {info.cost}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

function RelicPill({ relicId, relicData, lp, className, children }: {
  relicId: string; relicData: Record<string, RelicInfo>; lp: string; className?: string; children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = relicData[relicId];
  return (
    <Link href={`${lp}/relics/${relicId.toLowerCase()}`} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children || (info?.name || displayName(`RELIC.${relicId}`))}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${API}${info.image_url}`} alt="" className="w-8 h-8 object-contain" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

export default function MetaClient() {
  const lp = useLangPrefix();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/runs/stats`).then((r) => r.ok ? r.json() : null),
      cachedFetch<CardInfo[]>(`${API}/api/cards`),
      cachedFetch<RelicInfo[]>(`${API}/api/relics`),
    ]).then(([s, cards, relics]) => {
      setStats(s);
      const cm: Record<string, CardInfo> = {};
      for (const c of cards) cm[c.id] = c;
      setCardData(cm);
      const rm: Record<string, RelicInfo> = {};
      for (const r of relics) rm[r.id] = r;
      setRelicData(rm);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">Loading...</div>;
  }

  if (!stats || stats.total_runs === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Community Meta</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          No runs submitted yet. <Link href={`${lp}/runs`} className="text-[var(--accent-gold)] hover:underline">Submit a run</Link> to start building community stats.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Community Meta
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        Aggregated stats from {stats.total_runs} submitted runs.{" "}
        <Link href={`${lp}/runs`} className="text-[var(--accent-gold)] hover:underline">Submit yours</Link> to contribute.
      </p>

      <div className="space-y-4">
        {/* Overview */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.total_runs}</div>
              <div className="text-xs text-[var(--text-muted)]">Runs</div>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <div className="text-2xl font-bold text-emerald-400">{stats.total_wins}</div>
              <div className="text-xs text-[var(--text-muted)]">Wins</div>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <div className="text-2xl font-bold text-[var(--accent-gold)]">{stats.win_rate}%</div>
              <div className="text-xs text-[var(--text-muted)]">Win Rate</div>
            </div>
          </div>

          {stats.characters.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Win Rate by Character</h2>
              <div className="space-y-1.5">
                {stats.characters.map((c) => (
                  <div key={c.character} className="flex items-center justify-between text-sm">
                    <Link href={`${lp}/characters/${c.character.toLowerCase()}`} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]">
                      {displayName(`CHARACTER.${c.character}`)}
                    </Link>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[var(--text-muted)]">{c.wins}W / {c.total - c.wins}L</span>
                      <span className={`font-medium ${c.win_rate > 50 ? "text-emerald-400" : c.win_rate > 0 ? "text-[var(--text-secondary)]" : "text-red-400"}`}>{c.win_rate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pick Rates */}
        {stats.pick_rates.length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Highest Pick Rates</h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">How often a card is picked when offered (minimum 3 offers)</p>
            <div className="space-y-1">
              {stats.pick_rates.slice(0, 15).map((c) => (
                <div key={c.card_id} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                  <CardPill cardId={c.card_id} cardData={cardData} lp={lp} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--text-muted)]">{c.picked}/{c.offered}</span>
                    <span className="text-emerald-400 font-medium w-10 text-right">{c.pick_rate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cards in Winning Decks */}
        {stats.win_cards.length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Most Common Cards in Winning Decks</h2>
            <div className="space-y-1">
              {stats.win_cards.slice(0, 15).map((c) => (
                <div key={c.card_id} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                  <CardPill cardId={c.card_id} cardData={cardData} lp={lp} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                  <span className="text-xs text-[var(--text-muted)]">{c.count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Relics */}
        {stats.top_relics.length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Most Common Relics</h2>
            <div className="flex flex-wrap gap-1.5">
              {stats.top_relics.slice(0, 15).map((r) => (
                <RelicPill key={r.relic_id} relicId={r.relic_id} relicData={relicData} lp={lp}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-gold)] hover:bg-[var(--bg-card-hover)]">
                  {relicData[r.relic_id]?.name || displayName(`RELIC.${r.relic_id}`)} <span className="text-[var(--text-muted)]">({r.count})</span>
                </RelicPill>
              ))}
            </div>
          </div>
        )}

        {/* Deadliest Encounters */}
        {stats.deadliest.length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Most Deadly Encounters</h2>
            <div className="space-y-1">
              {stats.deadliest.map((d) => (
                <div key={d.encounter} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                  <Link href={`${lp}/encounters/${d.encounter.toLowerCase()}`} className="text-red-300 hover:text-red-200">
                    {displayName(`ENCOUNTER.${d.encounter}`)}
                  </Link>
                  <span className="text-xs text-[var(--text-muted)]">{d.count} deaths</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ascension Distribution */}
        {stats.ascensions.length > 1 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Ascension Distribution</h2>
            <div className="space-y-1">
              {stats.ascensions.map((a) => (
                <div key={a.level} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                  <span className="text-[var(--text-secondary)]">Ascension {a.level}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[var(--text-muted)]">{a.total} runs</span>
                    <span className={a.win_rate > 0 ? "text-emerald-400" : "text-[var(--text-muted)]"}>{a.win_rate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
