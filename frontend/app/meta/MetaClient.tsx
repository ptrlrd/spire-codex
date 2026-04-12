"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "../components/RichDescription";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BETA_SITE = "https://beta.spire-codex.com";
const BETA_API = BETA_SITE;

const CHART_COLORS = {
  gold: "#d4a843",
  green: "#34d399",
  red: "#f87171",
  blue: "#60a5fa",
  purple: "#a78bfa",
  orange: "#fb923c",
  cyan: "#22d3ee",
  muted: "#6b7280",
};

const CHAR_COLORS: Record<string, string> = {
  IRONCLAD: "#d53b27",
  SILENT: "#23935b",
  DEFECT: "#3873a9",
  NECROBINDER: "#bf5a85",
  REGENT: "#f07c1e",
};

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

interface PotionInfo {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_url: string | null;
}

interface CommunityStats {
  total_runs: number;
  total_wins: number;
  total_abandoned: number;
  win_rate: number;
  filters: { character: string | null; win: string | null; ascension: string | null; game_mode: string | null; players: string | null };
  characters: { character: string; total: number; wins: number; win_rate: number }[];
  ascensions: { level: number; total: number; wins: number; win_rate: number }[];
  top_cards: { card_id: string; count: number; in_wins: number; in_losses: number; win_runs: number; total_runs_with: number }[];
  pick_rates: { card_id: string; offered: number; picked: number; pick_rate: number }[];
  top_relics: { relic_id: string; count: number; total_runs_with: number; win_runs: number }[];
  top_potions: { potion_id: string; offered: number; picked: number; used: number; total_runs_with: number; win_runs: number; pick_rate: number }[];
  deadliest: { encounter: string; count: number }[];
}

function displayName(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "")
    .replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function BetaBadge() {
  return <span className="ml-1 text-[9px] font-semibold px-1 py-0.5 rounded bg-[var(--accent-gold)]/20 text-[var(--accent-gold)]">BETA</span>;
}

function CardPill({ cardId, cardData, lp, className, betaIds }: {
  cardId: string; cardData: Record<string, CardInfo>; lp: string; className?: string; betaIds?: Set<string>;
}) {
  const [show, setShow] = useState(false);
  const info = cardData[cardId];
  const isBeta = betaIds?.has(cardId);
  const href = isBeta ? `${BETA_SITE}/cards/${cardId.toLowerCase()}` : `${lp}/cards/${cardId.toLowerCase()}`;
  const imgBase = isBeta ? BETA_API : API;
  const El = isBeta ? "a" as const : Link;
  const linkProps = isBeta ? { href, target: "_blank" as const, rel: "noopener noreferrer" } : { href };
  return (
    <El {...linkProps} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {info?.name || displayName(`CARD.${cardId}`)}{isBeta && <BetaBadge />}
      {show && info && (
        <div className="absolute z-[100] bottom-full left-0 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${imgBase}${info.image_url}`} alt="" className="w-10 h-10 object-cover rounded" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}{isBeta && <BetaBadge />}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.type} · {info.rarity} · {info.cost}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
        </div>
      )}
    </El>
  );
}

function RelicPill({ relicId, relicData, lp, className, children, betaIds }: {
  relicId: string; relicData: Record<string, RelicInfo>; lp: string; className?: string; children?: React.ReactNode; betaIds?: Set<string>;
}) {
  const [show, setShow] = useState(false);
  const info = relicData[relicId];
  const isBeta = betaIds?.has(relicId);
  const href = isBeta ? `${BETA_SITE}/relics/${relicId.toLowerCase()}` : `${lp}/relics/${relicId.toLowerCase()}`;
  const imgBase = isBeta ? BETA_API : API;
  const El = isBeta ? "a" as const : Link;
  const linkProps = isBeta ? { href, target: "_blank" as const, rel: "noopener noreferrer" } : { href };
  return (
    <El {...linkProps} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children || (info?.name || displayName(`RELIC.${relicId}`))}{isBeta && !children && <BetaBadge />}
      {show && info && (
        <div className="absolute z-[100] bottom-full left-0 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${imgBase}${info.image_url}`} alt="" className="w-8 h-8 object-contain" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}{isBeta && <BetaBadge />}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
        </div>
      )}
    </El>
  );
}

function PotionPill({ potionId, potionData, lp, className, betaIds }: {
  potionId: string; potionData: Record<string, PotionInfo>; lp: string; className?: string; betaIds?: Set<string>;
}) {
  const [show, setShow] = useState(false);
  const info = potionData[potionId];
  const isBeta = betaIds?.has(potionId);
  const href = isBeta ? `${BETA_SITE}/potions/${potionId.toLowerCase()}` : `${lp}/potions/${potionId.toLowerCase()}`;
  const imgBase = isBeta ? BETA_API : API;
  const El = isBeta ? "a" as const : Link;
  const linkProps = isBeta ? { href, target: "_blank" as const, rel: "noopener noreferrer" } : { href };
  return (
    <El {...linkProps} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {info?.name || displayName(`POTION.${potionId}`)}{isBeta && <BetaBadge />}
      {show && info && (
        <div className="absolute z-[100] bottom-full left-0 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${imgBase}${info.image_url}`} alt="" className="w-8 h-8 object-contain" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}{isBeta && <BetaBadge />}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
        </div>
      )}
    </El>
  );
}

type SortKey = "pick_rate" | "offered" | "in_decks" | "win_pct" | "name";

export default function MetaClient() {
  const lp = useLangPrefix();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, PotionInfo>>({});
  const [betaIds, setBetaIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState("");
  const [winFilter, setWinFilter] = useState("");
  const [ascension, setAscension] = useState("");
  const [gameMode, setGameMode] = useState("");
  const [playerMode, setPlayerMode] = useState("");
  const [cardSort, setCardSort] = useState<SortKey>("pick_rate");
  const [showAllCards, setShowAllCards] = useState(false);
  const [cardView, setCardView] = useState<"chart" | "table">("table");
  const [relicSort, setRelicSort] = useState<"count" | "win_pct" | "name">("count");
  const [showAllRelics, setShowAllRelics] = useState(false);
  const [relicView, setRelicView] = useState<"chart" | "table">("table");

  useEffect(() => {
    // Fetch stable data, then fill gaps from beta API
    async function loadEntityData() {
      const [cards, relics, potions] = await Promise.all([
        cachedFetch<CardInfo[]>(`${API}/api/cards`),
        cachedFetch<RelicInfo[]>(`${API}/api/relics`),
        cachedFetch<PotionInfo[]>(`${API}/api/potions`),
      ]);
      const cm: Record<string, CardInfo> = {};
      for (const c of cards) cm[c.id] = c;
      setCardData(cm);
      const rm: Record<string, RelicInfo> = {};
      for (const r of relics) rm[r.id] = r;
      setRelicData(rm);
      const pm: Record<string, PotionInfo> = {};
      for (const p of potions) pm[p.id] = p;
      setPotionData(pm);

      // Fetch beta data and merge items not in stable
      try {
        const [betaCards, betaRelics, betaPotions] = await Promise.all([
          cachedFetch<CardInfo[]>(`${BETA_API}/api/cards`),
          cachedFetch<RelicInfo[]>(`${BETA_API}/api/relics`),
          cachedFetch<PotionInfo[]>(`${BETA_API}/api/potions`),
        ]);
        const newBetaIds = new Set<string>();
        const cmMerged = { ...cm };
        for (const c of betaCards) { if (!cmMerged[c.id]) { cmMerged[c.id] = c; newBetaIds.add(c.id); } }
        setCardData(cmMerged);
        const rmMerged = { ...rm };
        for (const r of betaRelics) { if (!rmMerged[r.id]) { rmMerged[r.id] = r; newBetaIds.add(r.id); } }
        setRelicData(rmMerged);
        const pmMerged = { ...pm };
        for (const p of betaPotions) { if (!pmMerged[p.id]) { pmMerged[p.id] = p; newBetaIds.add(p.id); } }
        setPotionData(pmMerged);
        setBetaIds(newBetaIds);
      } catch {
        // Beta API unavailable — no problem, stable data is sufficient
      }
    }
    loadEntityData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (character) params.set("character", character);
    if (winFilter) params.set("win", winFilter);
    if (ascension) params.set("ascension", ascension);
    if (gameMode) params.set("game_mode", gameMode);
    if (playerMode) params.set("players", playerMode);
    fetch(`${API}/api/runs/stats?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setStats(d))
      .finally(() => setLoading(false));
  }, [character, winFilter, ascension, gameMode, playerMode]);

  // Merge pick rates with deck counts into a unified card table
  const cardTable = (() => {
    if (!stats || stats.total_runs === 0) return [];
    const pickMap = new Map((stats.pick_rates || []).map((p) => [p.card_id, p]));
    const deckMap = new Map((stats.top_cards || []).map((c) => [c.card_id, c]));
    const allIds = new Set([...pickMap.keys(), ...deckMap.keys()]);
    const rows = [...allIds].map((id) => {
      const pick = pickMap.get(id);
      const deck = deckMap.get(id);
      const winRuns = deck?.win_runs || 0;
      const totalRunsWith = deck?.total_runs_with || 0;
      const winPct = totalRunsWith > 0 ? Math.round(winRuns / totalRunsWith * 100 * 10) / 10 : 0;
      return {
        card_id: id,
        name: cardData[id]?.name || displayName(`CARD.${id}`),
        offered: pick?.offered || 0,
        picked: pick?.picked || 0,
        pick_rate: pick?.pick_rate || 0,
        in_decks: deck?.count || 0,
        win_runs: winRuns,
        total_runs_with: totalRunsWith,
        win_pct: winPct,
      };
    });
    rows.sort((a, b) => {
      if (cardSort === "name") return a.name.localeCompare(b.name);
      if (cardSort === "pick_rate") return b.pick_rate - a.pick_rate || b.offered - a.offered;
      if (cardSort === "offered") return b.offered - a.offered;
      if (cardSort === "in_decks") return b.in_decks - a.in_decks;
      if (cardSort === "win_pct") return b.win_pct - a.win_pct || b.win_runs - a.win_runs;
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
        <select value={character} onChange={(e) => setCharacter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
          <option value="">All Characters</option>
          <option value="IRONCLAD">Ironclad</option>
          <option value="SILENT">Silent</option>
          <option value="DEFECT">Defect</option>
          <option value="NECROBINDER">Necrobinder</option>
          <option value="REGENT">Regent</option>
        </select>
        <select value={winFilter} onChange={(e) => setWinFilter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
          <option value="">All Runs</option>
          <option value="true">Wins</option>
          <option value="false">Losses</option>
          <option value="abandoned">Abandoned</option>
        </select>
        <select value={ascension} onChange={(e) => setAscension(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
          <option value="">All Ascensions</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={String(i)}>Ascension {i}</option>
          ))}
        </select>
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
          <option value="">All Game Types</option>
          <option value="standard">Standard</option>
          <option value="daily">Daily</option>
          <option value="custom">Custom</option>
        </select>
        <select value={playerMode} onChange={(e) => setPlayerMode(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
          <option value="">All Players</option>
          <option value="single">Single Player</option>
          <option value="multi">Multiplayer</option>
        </select>
        {loading && <span className="text-xs text-[var(--text-muted)] self-center">Updating...</span>}
      </div>

      {!stats || stats.total_runs === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">No runs match these filters.</div>
      ) : (
        <div className="space-y-4">
          {/* Overview */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
              <div className="bg-[var(--bg-primary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.total_runs}</div>
                <div className="text-xs text-[var(--text-muted)]">Runs</div>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-emerald-400">{stats.total_wins}</div>
                <div className="text-xs text-[var(--text-muted)]">Wins</div>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-red-400">{(stats.total_runs || 0) - (stats.total_wins || 0) - (stats.total_abandoned || 0)}</div>
                <div className="text-xs text-[var(--text-muted)]">Losses</div>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3">
                <div className="text-2xl font-bold text-[var(--accent-gold)]">{stats.win_rate}%</div>
                <div className="text-xs text-[var(--text-muted)]">Win Rate</div>
              </div>
            </div>

            {/* Win/Loss Pie + Character Bar side by side */}
            {!character && stats.characters && stats.characters.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {/* Win/Loss Pie */}
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Win / Loss</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Wins", value: stats.total_wins || 0 },
                          { name: "Losses", value: (stats.total_runs || 0) - (stats.total_wins || 0) - (stats.total_abandoned || 0) },
                          ...(stats.total_abandoned ? [{ name: "Abandoned", value: stats.total_abandoned }] : []),
                        ]}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        dataKey="value" stroke="none"
                      >
                        <Cell fill={CHART_COLORS.green} />
                        <Cell fill={CHART_COLORS.red} />
                        {stats.total_abandoned ? <Cell fill={CHART_COLORS.muted} /> : null}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Character Win Rate Bar */}
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Games by Character</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.characters.map((c) => ({
                      name: displayName(`CHARACTER.${c.character}`),
                      wins: c.wins,
                      losses: c.total - c.wins,
                      fill: CHAR_COLORS[c.character] || CHART_COLORS.muted,
                    }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="wins" stackId="a" fill={CHART_COLORS.green} name="Wins" />
                      <Bar dataKey="losses" stackId="a" fill={CHART_COLORS.red} name="Losses" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Character list (clickable) */}
            {!character && stats.characters && stats.characters.length > 0 && (
              <div className="space-y-1.5 mt-3">
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
            )}
          </div>

          {/* Card Stats */}
          {cardTable.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Card Stats ({cardTable.length})</h2>
                <div className="flex items-center gap-2">
                  {cardView === "table" && (
                    <button onClick={() => setShowAllCards(!showAllCards)} className="text-xs text-[var(--accent-gold)] hover:underline">
                      {showAllCards ? "Top 20" : "Show All"}
                    </button>
                  )}
                  <div className="flex rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                    <button onClick={() => setCardView("chart")}
                      className={`text-xs px-2.5 py-1 transition-colors ${cardView === "chart" ? "bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                      Chart
                    </button>
                    <button onClick={() => setCardView("table")}
                      className={`text-xs px-2.5 py-1 border-l border-[var(--border-subtle)] transition-colors ${cardView === "table" ? "bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                      Table
                    </button>
                  </div>
                </div>
              </div>

              {cardView === "chart" && (
                <ResponsiveContainer width="100%" height={Math.min(cardTable.filter((r) => r.offered > 0).length, 15) * 28 + 30}>
                  <BarChart
                    layout="vertical"
                    data={cardTable.filter((r) => r.offered > 0).slice(0, 15).map((r) => ({
                      name: r.name.length > 20 ? r.name.slice(0, 18) + "…" : r.name,
                      pick_rate: r.pick_rate,
                      offered: r.offered,
                    }))}
                    margin={{ left: 10, right: 20 }}
                  >
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} unit="%" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                      formatter={(value) => [`${value}%`, "Pick Rate"]}
                    />
                    <Bar dataKey="pick_rate" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {cardView === "table" && (
                <>

              {/* Sort buttons */}
              <div className="flex gap-1 mb-3">
                {([["pick_rate", "Pick Rate"], ["offered", "Offered"], ["in_decks", "In Decks"], ["win_pct", "Win %"], ["name", "Name"]] as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setCardSort(key)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      cardSort === key ? "border-[var(--accent-gold)]/40 text-[var(--accent-gold)] bg-[var(--accent-gold)]/5" : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-visible">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <th className="text-left py-1.5 font-medium">Card</th>
                      <th className="text-right py-1.5 font-medium w-16">Offered</th>
                      <th className="text-right py-1.5 font-medium w-16">Picked</th>
                      <th className="text-right py-1.5 font-medium w-16">Pick %</th>
                      <th className="text-right py-1.5 font-medium w-16">Runs</th>
                      <th className="text-right py-1.5 font-medium w-16">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllCards ? cardTable : cardTable.slice(0, 20)).map((row) => (
                      <tr key={row.card_id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-primary)]/50">
                        <td className="py-1.5">
                          <CardPill cardId={row.card_id} cardData={cardData} lp={lp} betaIds={betaIds} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                        </td>
                        <td className="text-right text-[var(--text-muted)]">{row.offered || "—"}</td>
                        <td className="text-right text-[var(--text-muted)]">{row.picked || "—"}</td>
                        <td className={`text-right font-medium ${row.pick_rate >= 75 ? "text-emerald-400" : row.pick_rate >= 50 ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                          {row.offered > 0 ? `${row.pick_rate}%` : "—"}
                        </td>
                        <td className="text-right text-[var(--text-muted)]">{row.total_runs_with || "—"}</td>
                        <td className={`text-right font-medium ${row.win_pct >= 50 ? "text-[var(--color-silent)]" : row.win_pct > 0 ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                          {row.total_runs_with > 0 ? `${row.win_pct}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
              )}
            </div>
          )}

          {/* Relic Stats */}
          {stats.top_relics && stats.top_relics.length > 0 && (() => {
            const relicRows = stats.top_relics.map((r) => {
              const winPct = r.total_runs_with > 0 ? Math.round(r.win_runs / r.total_runs_with * 100 * 10) / 10 : 0;
              return { ...r, name: relicData[r.relic_id]?.name || displayName(`RELIC.${r.relic_id}`), win_pct: winPct };
            }).sort((a, b) => {
              if (relicSort === "name") return a.name.localeCompare(b.name);
              if (relicSort === "win_pct") return b.win_pct - a.win_pct || b.win_runs - a.win_runs;
              return b.count - a.count;
            });
            return (
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Relic Stats ({relicRows.length})</h2>
                  <div className="flex items-center gap-2">
                    {relicView === "table" && (
                      <button onClick={() => setShowAllRelics(!showAllRelics)} className="text-xs text-[var(--accent-gold)] hover:underline">
                        {showAllRelics ? "Top 20" : "Show All"}
                      </button>
                    )}
                    <div className="flex rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                      <button onClick={() => setRelicView("chart")}
                        className={`text-xs px-2.5 py-1 transition-colors ${relicView === "chart" ? "bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                        Chart
                      </button>
                      <button onClick={() => setRelicView("table")}
                        className={`text-xs px-2.5 py-1 border-l border-[var(--border-subtle)] transition-colors ${relicView === "table" ? "bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                        Table
                      </button>
                    </div>
                  </div>
                </div>

                {relicView === "chart" && (
                  <ResponsiveContainer width="100%" height={Math.min(relicRows.length, 15) * 28 + 30}>
                    <BarChart layout="vertical"
                      data={relicRows.slice(0, 15).map((r) => ({ name: r.name.length > 20 ? r.name.slice(0, 18) + "…" : r.name, count: r.total_runs_with }))}
                      margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} name="Runs" />
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {relicView === "table" && (
                  <>
                    <div className="flex gap-1 mb-3">
                      {([["count", "Runs"], ["win_pct", "Win %"], ["name", "Name"]] as [typeof relicSort, string][]).map(([key, label]) => (
                        <button key={key} onClick={() => setRelicSort(key)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            relicSort === key ? "border-[var(--accent-gold)]/40 text-[var(--accent-gold)] bg-[var(--accent-gold)]/5" : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="overflow-visible">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                            <th className="text-left py-1.5 font-medium">Relic</th>
                            <th className="text-right py-1.5 font-medium w-16">Runs</th>
                            <th className="text-right py-1.5 font-medium w-16">Win %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(showAllRelics ? relicRows : relicRows.slice(0, 20)).map((r) => (
                            <tr key={r.relic_id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-primary)]/50">
                              <td className="py-1.5">
                                <RelicPill relicId={r.relic_id} relicData={relicData} lp={lp} betaIds={betaIds} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                              </td>
                              <td className="text-right text-[var(--text-muted)]">{r.total_runs_with}</td>
                              <td className={`text-right font-medium ${r.win_pct >= 50 ? "text-[var(--color-silent)]" : r.win_pct > 0 ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                                {r.total_runs_with > 0 ? `${r.win_pct}%` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Potion Stats */}
          {stats.top_potions && stats.top_potions.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Potion Stats ({stats.top_potions.length})</h2>
              <div className="overflow-visible">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <th className="text-left py-1.5 font-medium">Potion</th>
                      <th className="text-right py-1.5 font-medium w-16">Offered</th>
                      <th className="text-right py-1.5 font-medium w-16">Picked</th>
                      <th className="text-right py-1.5 font-medium w-16">Pick %</th>
                      <th className="text-right py-1.5 font-medium w-16">Used</th>
                      <th className="text-right py-1.5 font-medium w-16">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_potions.map((p) => {
                      const winPct = p.total_runs_with > 0 ? Math.round(p.win_runs / p.total_runs_with * 100 * 10) / 10 : 0;
                      return (
                        <tr key={p.potion_id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-primary)]/50">
                          <td className="py-1.5">
                            <PotionPill potionId={p.potion_id} potionData={potionData} lp={lp} betaIds={betaIds} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                          </td>
                          <td className="text-right text-[var(--text-muted)]">{p.offered}</td>
                          <td className="text-right text-[var(--text-muted)]">{p.picked}</td>
                          <td className={`text-right font-medium ${p.pick_rate >= 75 ? "text-[var(--color-silent)]" : p.pick_rate >= 50 ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                            {p.offered > 0 ? `${p.pick_rate}%` : "—"}
                          </td>
                          <td className="text-right text-[var(--accent-teal)]">{p.used || "—"}</td>
                          <td className={`text-right font-medium ${winPct >= 50 ? "text-[var(--color-silent)]" : winPct > 0 ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                            {p.total_runs_with > 0 ? `${winPct}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Deadliest Encounters */}
          {stats.deadliest && stats.deadliest.length > 0 && (
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
          {stats.ascensions && stats.ascensions.length > 1 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Ascension Distribution</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.ascensions.map((a) => ({
                  name: `A${a.level}`,
                  wins: a.wins || 0,
                  losses: a.total - (a.wins || 0),
                }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="wins" stackId="a" fill={CHART_COLORS.green} name="Wins" />
                  <Bar dataKey="losses" stackId="a" fill={CHART_COLORS.red} name="Losses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-3">
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
