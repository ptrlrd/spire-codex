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
  color: string;
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
  filters: { character: string | null; win: string | null };
  characters: { character: string; total: number; wins: number; win_rate: number }[];
  ascensions: { level: number; total: number; wins: number; win_rate: number }[];
  top_cards: { card_id: string; count: number; in_wins: number; in_losses: number }[];
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

type SortKey = "pick_rate" | "offered" | "in_decks" | "in_wins" | "name";

export default function MetaClient() {
  const lp = useLangPrefix();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState("");
  const [winFilter, setWinFilter] = useState("");
  const [cardSort, setCardSort] = useState<SortKey>("pick_rate");
  const [showAllCards, setShowAllCards] = useState(false);

  useEffect(() => {
    cachedFetch<CardInfo[]>(`${API}/api/cards`).then((cards) => {
      const cm: Record<string, CardInfo> = {};
      for (const c of cards) cm[c.id] = c;
      setCardData(cm);
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics`).then((relics) => {
      const rm: Record<string, RelicInfo> = {};
      for (const r of relics) rm[r.id] = r;
      setRelicData(rm);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (character) params.set("character", character);
    if (winFilter) params.set("win", winFilter);
    fetch(`${API}/api/runs/stats?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setStats(d))
      .finally(() => setLoading(false));
  }, [character, winFilter]);

  // Merge pick rates with deck counts into a unified card table
  const cardTable = (() => {
    if (!stats) return [];
    const pickMap = new Map(stats.pick_rates.map((p) => [p.card_id, p]));
    const deckMap = new Map(stats.top_cards.map((c) => [c.card_id, c]));
    const allIds = new Set([...pickMap.keys(), ...deckMap.keys()]);
    const rows = [...allIds].map((id) => {
      const pick = pickMap.get(id);
      const deck = deckMap.get(id);
      return {
        card_id: id,
        name: cardData[id]?.name || displayName(`CARD.${id}`),
        offered: pick?.offered || 0,
        picked: pick?.picked || 0,
        pick_rate: pick?.pick_rate || 0,
        in_decks: deck?.count || 0,
        in_wins: deck?.in_wins || 0,
        in_losses: deck?.in_losses || 0,
      };
    });
    rows.sort((a, b) => {
      if (cardSort === "name") return a.name.localeCompare(b.name);
      if (cardSort === "pick_rate") return b.pick_rate - a.pick_rate || b.offered - a.offered;
      if (cardSort === "offered") return b.offered - a.offered;
      if (cardSort === "in_decks") return b.in_decks - a.in_decks;
      if (cardSort === "in_wins") return b.in_wins - a.in_wins;
      return 0;
    });
    return rows;
  })();

  if (loading && !stats) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">Loading...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Community Meta</h1>
      <p className="text-[var(--text-secondary)] mb-4">
        Aggregated stats from {stats?.total_runs || 0} submitted runs.{" "}
        <Link href={`${lp}/runs`} className="text-[var(--accent-gold)] hover:underline">Submit yours</Link> to contribute.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="">All Characters</option>
          <option value="IRONCLAD">Ironclad</option>
          <option value="SILENT">Silent</option>
          <option value="DEFECT">Defect</option>
          <option value="NECROBINDER">Necrobinder</option>
          <option value="REGENT">Regent</option>
        </select>
        <select
          value={winFilter}
          onChange={(e) => setWinFilter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="">All Runs</option>
          <option value="true">Wins Only</option>
          <option value="false">Losses Only</option>
        </select>
        {loading && <span className="text-xs text-[var(--text-muted)] self-center">Updating...</span>}
      </div>

      {!stats || stats.total_runs === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">No runs match these filters.</div>
      ) : (
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

            {!character && stats.characters.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Win Rate by Character</h2>
                <div className="space-y-1.5">
                  {stats.characters.map((c) => (
                    <button key={c.character} onClick={() => setCharacter(c.character)}
                      className="flex items-center justify-between text-sm w-full text-left hover:bg-[var(--bg-primary)] rounded px-2 py-1 transition-colors">
                      <span className="text-[var(--text-secondary)]">{displayName(`CHARACTER.${c.character}`)}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[var(--text-muted)]">{c.wins}W / {c.total - c.wins}L</span>
                        <span className={`font-medium ${c.win_rate > 50 ? "text-emerald-400" : c.win_rate > 0 ? "text-[var(--text-secondary)]" : "text-red-400"}`}>{c.win_rate}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Card Table */}
          {cardTable.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Card Stats ({cardTable.length})</h2>
                <button onClick={() => setShowAllCards(!showAllCards)} className="text-xs text-[var(--accent-gold)] hover:underline">
                  {showAllCards ? "Show Top 20" : "Show All"}
                </button>
              </div>

              {/* Sort buttons */}
              <div className="flex gap-1 mb-3">
                {([["pick_rate", "Pick Rate"], ["offered", "Offered"], ["in_decks", "In Decks"], ["in_wins", "In Wins"], ["name", "Name"]] as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setCardSort(key)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      cardSort === key ? "border-[var(--accent-gold)]/40 text-[var(--accent-gold)] bg-[var(--accent-gold)]/5" : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <th className="text-left py-1.5 font-medium">Card</th>
                      <th className="text-right py-1.5 font-medium w-16">Offered</th>
                      <th className="text-right py-1.5 font-medium w-16">Picked</th>
                      <th className="text-right py-1.5 font-medium w-16">Pick %</th>
                      <th className="text-right py-1.5 font-medium w-16">In Decks</th>
                      <th className="text-right py-1.5 font-medium w-16">In Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllCards ? cardTable : cardTable.slice(0, 20)).map((row) => (
                      <tr key={row.card_id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-primary)]/50">
                        <td className="py-1.5">
                          <CardPill cardId={row.card_id} cardData={cardData} lp={lp} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                        </td>
                        <td className="text-right text-[var(--text-muted)]">{row.offered || "—"}</td>
                        <td className="text-right text-[var(--text-muted)]">{row.picked || "—"}</td>
                        <td className={`text-right font-medium ${row.pick_rate >= 75 ? "text-emerald-400" : row.pick_rate >= 50 ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                          {row.offered > 0 ? `${row.pick_rate}%` : "—"}
                        </td>
                        <td className="text-right text-[var(--text-muted)]">{row.in_decks || "—"}</td>
                        <td className={`text-right ${row.in_wins > 0 ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                          {row.in_wins || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Relics */}
          {stats.top_relics.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Most Common Relics</h2>
              <div className="flex flex-wrap gap-1.5">
                {stats.top_relics.map((r) => (
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
      )}
    </div>
  );
}
