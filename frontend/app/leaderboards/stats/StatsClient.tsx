"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "@/app/components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BETA_SITE = "https://beta.spire-codex.com";
const BETA_API = BETA_SITE;

const CHAR_COLORS: Record<string, string> = {
  IRONCLAD: "#d53b27",
  SILENT: "#23935b",
  DEFECT: "#3873a9",
  NECROBINDER: "#bf5a85",
  REGENT: "#f07c1e",
};

const CHARACTERS = ["IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"] as const;

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
  filters: {
    character: string | null;
    win: string | null;
    ascension: string | null;
    game_mode: string | null;
    players: string | null;
  };
  characters: { character: string; total: number; wins: number; win_rate: number }[];
  ascensions: { level: number; total: number; wins: number; win_rate: number }[];
  top_cards: {
    card_id: string;
    count: number;
    in_wins: number;
    in_losses: number;
    win_runs: number;
    total_runs_with: number;
  }[];
  pick_rates: { card_id: string; offered: number; picked: number; pick_rate: number }[];
  top_relics: {
    relic_id: string;
    count: number;
    total_runs_with: number;
    win_runs: number;
  }[];
  top_potions: {
    potion_id: string;
    offered: number;
    picked: number;
    used: number;
    total_runs_with: number;
    win_runs: number;
    pick_rate: number;
  }[];
  deadliest: { encounter: string; count: number }[];
}

function displayName(id: string): string {
  return id
    .replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function BetaBadge() {
  return (
    <span className="ml-1 text-[9px] font-semibold px-1 py-0.5 rounded bg-[var(--accent-gold)]/20 text-[var(--accent-gold)]">
      BETA
    </span>
  );
}

type EntityKind = "card" | "relic" | "potion";

function EntityRowPill({
  kind,
  id,
  name,
  imageSrc,
  subtitle,
  description,
  lp,
  isBeta,
}: {
  kind: EntityKind;
  id: string;
  name: string;
  imageSrc: string | null;
  subtitle: string;
  description: string;
  lp: string;
  isBeta: boolean;
}) {
  const [show, setShow] = useState(false);
  const href = isBeta
    ? `${BETA_SITE}/${kind}s/${id.toLowerCase()}`
    : `${lp}/${kind}s/${id.toLowerCase()}`;

  const linkClass =
    "relative inline-flex items-center gap-2.5 text-[var(--text-primary)] hover:text-[var(--accent-gold)] transition-colors";

  const content = (
    <>
      <span className="flex-shrink-0 w-9 h-9 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={name}
            className={kind === "card" ? "w-full h-full object-cover" : "w-full h-full object-contain p-0.5"}
            crossOrigin="anonymous"
          />
        ) : (
          <span className="text-[9px] text-[var(--text-muted)]">—</span>
        )}
      </span>
      <span className="truncate font-medium text-sm">
        {name}
        {isBeta && <BetaBadge />}
      </span>
      {show && (
        <span className="absolute z-[100] bottom-full left-0 mb-2 w-60 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left">
          <span className="flex items-start gap-2 mb-1.5">
            {imageSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt=""
                className={
                  kind === "card"
                    ? "w-10 h-10 object-cover rounded"
                    : "w-8 h-8 object-contain"
                }
                crossOrigin="anonymous"
              />
            )}
            <span className="min-w-0 block">
              <span className="font-semibold text-xs text-[var(--text-primary)] truncate block">
                {name}
                {isBeta && <BetaBadge />}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] block">{subtitle}</span>
            </span>
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] leading-relaxed block">
            <RichDescription text={description} />
          </span>
        </span>
      )}
    </>
  );

  if (isBeta) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {content}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={linkClass}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {content}
    </Link>
  );
}

type TopTab = "overview" | "cards" | "relics" | "potions" | "encounters";

type CardSort = "pick_rate" | "win_pct" | "count" | "name";
type RelicSort = "pick_rate" | "win_pct" | "count" | "name";
type PotionSort = "pick_rate" | "use_rate" | "win_pct" | "count" | "name";

function PercentBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right tabular-nums text-xs font-medium text-[var(--text-primary)]">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function winRateColor(wr: number): string {
  if (wr >= 60) return "var(--color-silent)";
  if (wr >= 50) return "#34d399";
  if (wr >= 35) return "var(--accent-gold)";
  return "var(--text-muted)";
}

function pickRateColor(pr: number): string {
  if (pr >= 60) return "var(--accent-gold)";
  if (pr >= 40) return "#60a5fa";
  return "var(--text-muted)";
}

export default function StatsClient() {
  const lp = useLangPrefix();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, PotionInfo>>({});
  const [betaIds, setBetaIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Top-level filters
  const [character, setCharacter] = useState("");
  const [winFilter, setWinFilter] = useState("");
  const [ascension, setAscension] = useState("");

  // Tabs
  const [tab, setTab] = useState<TopTab>("overview");

  // Card filters
  const [cardType, setCardType] = useState("");
  const [cardRarity, setCardRarity] = useState("");
  const [cardCost, setCardCost] = useState("");
  const [cardSort, setCardSort] = useState<CardSort>("pick_rate");

  // Relic filters
  const [relicRarity, setRelicRarity] = useState("");
  const [relicSort, setRelicSort] = useState<RelicSort>("pick_rate");

  // Potion filters
  const [potionRarity, setPotionRarity] = useState("");
  const [potionSort, setPotionSort] = useState<PotionSort>("pick_rate");

  useEffect(() => {
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

      // Merge beta-only entities
      try {
        const [betaCards, betaRelics, betaPotions] = await Promise.all([
          cachedFetch<CardInfo[]>(`${BETA_API}/api/cards`),
          cachedFetch<RelicInfo[]>(`${BETA_API}/api/relics`),
          cachedFetch<PotionInfo[]>(`${BETA_API}/api/potions`),
        ]);
        const newBetaIds = new Set<string>();
        const cmMerged = { ...cm };
        for (const c of betaCards) {
          if (!cmMerged[c.id]) {
            cmMerged[c.id] = c;
            newBetaIds.add(c.id);
          }
        }
        setCardData(cmMerged);
        const rmMerged = { ...rm };
        for (const r of betaRelics) {
          if (!rmMerged[r.id]) {
            rmMerged[r.id] = r;
            newBetaIds.add(r.id);
          }
        }
        setRelicData(rmMerged);
        const pmMerged = { ...pm };
        for (const p of betaPotions) {
          if (!pmMerged[p.id]) {
            pmMerged[p.id] = p;
            newBetaIds.add(p.id);
          }
        }
        setPotionData(pmMerged);
        setBetaIds(newBetaIds);
      } catch {
        // Beta API unavailable — no problem
      }
    }
    loadEntityData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (character) params.set("character", character);
    if (winFilter) params.set("win", winFilter);
    if (ascension) params.set("ascension", ascension);
    setLoading(true);
    fetch(`${API}/api/runs/stats?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStats(d))
      .finally(() => setLoading(false));
  }, [character, winFilter, ascension]);

  const imgBaseFor = (id: string) => (betaIds.has(id) ? BETA_API : API);

  // Build combined card table
  const cardRows = useMemo(() => {
    if (!stats || stats.total_runs === 0) return [];
    const pickMap = new Map((stats.pick_rates || []).map((p) => [p.card_id, p]));
    const deckMap = new Map((stats.top_cards || []).map((c) => [c.card_id, c]));
    const allIds = new Set<string>([...pickMap.keys(), ...deckMap.keys()]);
    const rows = [...allIds].map((id) => {
      const pick = pickMap.get(id);
      const deck = deckMap.get(id);
      const winRuns = deck?.win_runs || 0;
      const totalRunsWith = deck?.total_runs_with || 0;
      const winPct =
        totalRunsWith > 0 ? Math.round((winRuns / totalRunsWith) * 1000) / 10 : 0;
      const info = cardData[id];
      return {
        id,
        name: info?.name || displayName(`CARD.${id}`),
        type: info?.type || "",
        rarity: info?.rarity || "",
        cost: info?.cost ?? -99,
        color: info?.color || "",
        image_url: info?.image_url || null,
        description: info?.description || "",
        offered: pick?.offered || 0,
        picked: pick?.picked || 0,
        pick_rate: pick?.pick_rate || 0,
        count: deck?.count || 0,
        win_runs: winRuns,
        total_runs_with: totalRunsWith,
        win_pct: winPct,
      };
    });
    return rows;
  }, [stats, cardData]);

  const cardTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of cardRows) if (r.type) s.add(r.type);
    return [...s].sort();
  }, [cardRows]);

  const cardRarities = useMemo(() => {
    const s = new Set<string>();
    for (const r of cardRows) if (r.rarity) s.add(r.rarity);
    return [...s].sort();
  }, [cardRows]);

  const filteredCards = useMemo(() => {
    const filtered = cardRows.filter((r) => {
      if (cardType && r.type !== cardType) return false;
      if (cardRarity && r.rarity !== cardRarity) return false;
      if (cardCost !== "") {
        if (cardCost === "X" && r.cost !== -1) return false;
        else if (cardCost !== "X" && r.cost !== Number(cardCost)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      if (cardSort === "name") return a.name.localeCompare(b.name);
      if (cardSort === "pick_rate") return b.pick_rate - a.pick_rate || b.offered - a.offered;
      if (cardSort === "win_pct") return b.win_pct - a.win_pct || b.win_runs - a.win_runs;
      if (cardSort === "count") return b.count - a.count;
      return 0;
    });
    return filtered;
  }, [cardRows, cardType, cardRarity, cardCost, cardSort]);

  // Relics
  const relicRows = useMemo(() => {
    if (!stats || stats.total_runs === 0) return [];
    return (stats.top_relics || []).map((r) => {
      const info = relicData[r.relic_id];
      const winPct =
        r.total_runs_with > 0 ? Math.round((r.win_runs / r.total_runs_with) * 1000) / 10 : 0;
      const pickRate =
        stats.total_runs > 0 ? Math.round((r.count / stats.total_runs) * 1000) / 10 : 0;
      return {
        id: r.relic_id,
        name: info?.name || displayName(`RELIC.${r.relic_id}`),
        rarity: info?.rarity || "",
        image_url: info?.image_url || null,
        description: info?.description || "",
        count: r.count,
        total_runs_with: r.total_runs_with,
        win_runs: r.win_runs,
        pick_rate: pickRate,
        win_pct: winPct,
      };
    });
  }, [stats, relicData]);

  const relicRarities = useMemo(() => {
    const s = new Set<string>();
    for (const r of relicRows) if (r.rarity) s.add(r.rarity);
    return [...s].sort();
  }, [relicRows]);

  const filteredRelics = useMemo(() => {
    const filtered = relicRows.filter((r) => !relicRarity || r.rarity === relicRarity);
    filtered.sort((a, b) => {
      if (relicSort === "name") return a.name.localeCompare(b.name);
      if (relicSort === "pick_rate") return b.pick_rate - a.pick_rate || b.count - a.count;
      if (relicSort === "win_pct") return b.win_pct - a.win_pct || b.win_runs - a.win_runs;
      if (relicSort === "count") return b.count - a.count;
      return 0;
    });
    return filtered;
  }, [relicRows, relicRarity, relicSort]);

  // Potions
  const potionRows = useMemo(() => {
    if (!stats || stats.total_runs === 0) return [];
    return (stats.top_potions || []).map((p) => {
      const info = potionData[p.potion_id];
      const winPct =
        p.total_runs_with > 0 ? Math.round((p.win_runs / p.total_runs_with) * 1000) / 10 : 0;
      const useRate =
        p.picked > 0 ? Math.round((p.used / p.picked) * 1000) / 10 : 0;
      return {
        id: p.potion_id,
        name: info?.name || displayName(`POTION.${p.potion_id}`),
        rarity: info?.rarity || "",
        image_url: info?.image_url || null,
        description: info?.description || "",
        offered: p.offered,
        picked: p.picked,
        used: p.used,
        total_runs_with: p.total_runs_with,
        win_runs: p.win_runs,
        pick_rate: p.pick_rate,
        use_rate: useRate,
        win_pct: winPct,
      };
    });
  }, [stats, potionData]);

  const potionRarities = useMemo(() => {
    const s = new Set<string>();
    for (const r of potionRows) if (r.rarity) s.add(r.rarity);
    return [...s].sort();
  }, [potionRows]);

  const filteredPotions = useMemo(() => {
    const filtered = potionRows.filter((p) => !potionRarity || p.rarity === potionRarity);
    filtered.sort((a, b) => {
      if (potionSort === "name") return a.name.localeCompare(b.name);
      if (potionSort === "pick_rate") return b.pick_rate - a.pick_rate || b.offered - a.offered;
      if (potionSort === "use_rate") return b.use_rate - a.use_rate || b.used - a.used;
      if (potionSort === "win_pct") return b.win_pct - a.win_pct || b.win_runs - a.win_runs;
      if (potionSort === "count") return b.total_runs_with - a.total_runs_with;
      return 0;
    });
    return filtered;
  }, [potionRows, potionRarity, potionSort]);

  if (loading && !stats) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  const TABS: { key: TopTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "cards", label: "Cards" },
    { key: "relics", label: "Relics" },
    { key: "potions", label: "Potions" },
    { key: "encounters", label: "Encounters" },
  ];

  const selectClass =
    "text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Stats</h1>
      <p className="text-[var(--text-secondary)] mb-5">
        {stats?.total_runs || 0} runs analyzed.{" "}
        <Link
          href={`${lp}/leaderboards/submit`}
          className="text-[var(--accent-gold)] hover:underline"
        >
          Submit yours
        </Link>{" "}
        to contribute.
      </p>

      {/* Global filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
          className={selectClass}
          style={{
            borderColor: character ? CHAR_COLORS[character] : undefined,
          }}
        >
          <option value="">All Characters</option>
          {CHARACTERS.map((c) => (
            <option key={c} value={c}>
              {displayName(`CHARACTER.${c}`)}
            </option>
          ))}
        </select>
        <select
          value={ascension}
          onChange={(e) => setAscension(e.target.value)}
          className={selectClass}
        >
          <option value="">All Ascensions</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={String(i)}>
              Ascension {i}
            </option>
          ))}
        </select>
        <select
          value={winFilter}
          onChange={(e) => setWinFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Outcomes</option>
          <option value="true">Wins only</option>
          <option value="false">Losses only</option>
          <option value="abandoned">Abandoned</option>
        </select>
        {loading && (
          <span className="text-xs text-[var(--text-muted)] self-center">Updating...</span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm px-4 py-2 -mb-px border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!stats || stats.total_runs === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          No runs match these filters.
        </div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab stats={stats} onCharacterClick={setCharacter} />}
          {tab === "cards" && (
            <CardsTab
              rows={filteredCards}
              totalRuns={stats.total_runs}
              cardTypes={cardTypes}
              cardRarities={cardRarities}
              cardType={cardType}
              setCardType={setCardType}
              cardRarity={cardRarity}
              setCardRarity={setCardRarity}
              cardCost={cardCost}
              setCardCost={setCardCost}
              cardSort={cardSort}
              setCardSort={setCardSort}
              lp={lp}
              betaIds={betaIds}
              imgBaseFor={imgBaseFor}
            />
          )}
          {tab === "relics" && (
            <RelicsTab
              rows={filteredRelics}
              relicRarities={relicRarities}
              relicRarity={relicRarity}
              setRelicRarity={setRelicRarity}
              relicSort={relicSort}
              setRelicSort={setRelicSort}
              lp={lp}
              betaIds={betaIds}
              imgBaseFor={imgBaseFor}
            />
          )}
          {tab === "potions" && (
            <PotionsTab
              rows={filteredPotions}
              potionRarities={potionRarities}
              potionRarity={potionRarity}
              setPotionRarity={setPotionRarity}
              potionSort={potionSort}
              setPotionSort={setPotionSort}
              lp={lp}
              betaIds={betaIds}
              imgBaseFor={imgBaseFor}
            />
          )}
          {tab === "encounters" && <EncountersTab stats={stats} lp={lp} />}
        </>
      )}
    </div>
  );
}

/* ------------------------- Overview ------------------------- */

function OverviewTab({
  stats,
  onCharacterClick,
}: {
  stats: CommunityStats;
  onCharacterClick: (c: string) => void;
}) {
  const losses =
    (stats.total_runs || 0) - (stats.total_wins || 0) - (stats.total_abandoned || 0);

  const maxCharTotal = Math.max(1, ...stats.characters.map((c) => c.total));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {stats.total_runs}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Runs</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-emerald-400">{stats.total_wins}</div>
            <div className="text-xs text-[var(--text-muted)]">Wins</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-red-400">{losses}</div>
            <div className="text-xs text-[var(--text-muted)]">Losses</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--accent-gold)]">
              {stats.win_rate}%
            </div>
            <div className="text-xs text-[var(--text-muted)]">Win Rate</div>
          </div>
        </div>
      </div>

      {stats.characters && stats.characters.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Character Win Rates
          </h2>
          <div className="space-y-2">
            {stats.characters.map((c) => {
              const charColor = CHAR_COLORS[c.character] || "var(--text-muted)";
              const totalPct = (c.total / maxCharTotal) * 100;
              const winPct = c.total > 0 ? (c.wins / c.total) * 100 : 0;
              return (
                <button
                  key={c.character}
                  onClick={() => onCharacterClick(c.character)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-sm font-medium group-hover:text-[var(--accent-gold)] transition-colors"
                      style={{ color: charColor }}
                    >
                      {displayName(`CHARACTER.${c.character}`)}
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[var(--text-muted)]">
                        {c.wins}W / {c.total - c.wins}L
                      </span>
                      <span
                        className="font-semibold tabular-nums"
                        style={{ color: winRateColor(c.win_rate) }}
                      >
                        {c.win_rate}%
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full opacity-40"
                      style={{ width: `${totalPct}%`, backgroundColor: charColor }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${(totalPct * winPct) / 100}%`,
                        backgroundColor: charColor,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stats.ascensions && stats.ascensions.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Ascension Breakdown
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium">Ascension</th>
                <th className="text-right py-2 font-medium">Runs</th>
                <th className="text-right py-2 font-medium">Wins</th>
                <th className="text-right py-2 font-medium">Losses</th>
                <th className="text-right py-2 font-medium">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {stats.ascensions.map((a) => (
                <tr
                  key={a.level}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-primary)]/40"
                >
                  <td className="py-2 text-[var(--text-primary)] font-medium">A{a.level}</td>
                  <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums">
                    {a.total}
                  </td>
                  <td className="py-2 text-right text-emerald-400 tabular-nums">{a.wins}</td>
                  <td className="py-2 text-right text-red-400 tabular-nums">
                    {a.total - a.wins}
                  </td>
                  <td
                    className="py-2 text-right font-semibold tabular-nums"
                    style={{ color: winRateColor(a.win_rate) }}
                  >
                    {a.win_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Cards ------------------------- */

interface CardRow {
  id: string;
  name: string;
  type: string;
  rarity: string;
  cost: number;
  color: string;
  image_url: string | null;
  description: string;
  offered: number;
  picked: number;
  pick_rate: number;
  count: number;
  win_runs: number;
  total_runs_with: number;
  win_pct: number;
}

function CardsTab({
  rows,
  cardTypes,
  cardRarities,
  cardType,
  setCardType,
  cardRarity,
  setCardRarity,
  cardCost,
  setCardCost,
  cardSort,
  setCardSort,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: CardRow[];
  totalRuns: number;
  cardTypes: string[];
  cardRarities: string[];
  cardType: string;
  setCardType: (s: string) => void;
  cardRarity: string;
  setCardRarity: (s: string) => void;
  cardCost: string;
  setCardCost: (s: string) => void;
  cardSort: CardSort;
  setCardSort: (s: CardSort) => void;
  lp: string;
  betaIds: Set<string>;
  imgBaseFor: (id: string) => string;
}) {
  const selectClass =
    "text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]";

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <select value={cardType} onChange={(e) => setCardType(e.target.value)} className={selectClass}>
            <option value="">All Types</option>
            {cardTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={cardRarity}
            onChange={(e) => setCardRarity(e.target.value)}
            className={selectClass}
          >
            <option value="">All Rarities</option>
            {cardRarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={cardCost} onChange={(e) => setCardCost(e.target.value)} className={selectClass}>
            <option value="">All Costs</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4+</option>
            <option value="X">X</option>
          </select>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} cards</span>
      </div>

      <CardTable
        rows={rows}
        cardSort={cardSort}
        setCardSort={setCardSort}
        lp={lp}
        betaIds={betaIds}
        imgBaseFor={imgBaseFor}
      />
    </div>
  );
}

function SortHeader<T extends string>({
  column,
  current,
  onClick,
  children,
  align = "right",
}: {
  column: T;
  current: T;
  onClick: (col: T) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = column === current;
  return (
    <th
      onClick={() => onClick(column)}
      className={`py-2 font-medium cursor-pointer select-none transition-colors ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-[10px]">▼</span>}
      </span>
    </th>
  );
}

function CardTable({
  rows,
  cardSort,
  setCardSort,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: CardRow[];
  cardSort: CardSort;
  setCardSort: (s: CardSort) => void;
  lp: string;
  betaIds: Set<string>;
  imgBaseFor: (id: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--text-muted)]">No cards match.</div>
    );
  }
  return (
    <div className="overflow-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
            <SortHeader column="name" current={cardSort} onClick={setCardSort} align="left">
              Card
            </SortHeader>
            <SortHeader column="pick_rate" current={cardSort} onClick={setCardSort}>
              Pick Rate
            </SortHeader>
            <SortHeader column="win_pct" current={cardSort} onClick={setCardSort}>
              Win Rate
            </SortHeader>
            <SortHeader column="count" current={cardSort} onClick={setCardSort}>
              Count
            </SortHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]/60 transition-colors"
            >
              <td className="py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
              <td className="py-2 min-w-[200px]">
                <EntityRowPill
                  kind="card"
                  id={r.id}
                  name={r.name}
                  imageSrc={r.image_url ? `${imgBaseFor(r.id)}${r.image_url}` : null}
                  subtitle={`${r.type || "—"} · ${r.rarity || "—"} · ${r.cost >= 0 ? r.cost : r.cost === -1 ? "X" : "—"}`}
                  description={r.description}
                  lp={lp}
                  isBeta={betaIds.has(r.id)}
                />
              </td>
              <td className="py-2">
                <div className="flex justify-end">
                  {r.offered > 0 ? (
                    <PercentBar value={r.pick_rate} color={pickRateColor(r.pick_rate)} />
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </div>
              </td>
              <td className="py-2">
                <div className="flex justify-end">
                  {r.total_runs_with > 0 ? (
                    <PercentBar value={r.win_pct} color={winRateColor(r.win_pct)} />
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </div>
              </td>
              <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums">
                {r.total_runs_with || r.count || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------- Relics ------------------------- */

interface RelicRow {
  id: string;
  name: string;
  rarity: string;
  image_url: string | null;
  description: string;
  count: number;
  total_runs_with: number;
  win_runs: number;
  pick_rate: number;
  win_pct: number;
}

function RelicsTab({
  rows,
  relicRarities,
  relicRarity,
  setRelicRarity,
  relicSort,
  setRelicSort,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: RelicRow[];
  relicRarities: string[];
  relicRarity: string;
  setRelicRarity: (s: string) => void;
  relicSort: RelicSort;
  setRelicSort: (s: RelicSort) => void;
  lp: string;
  betaIds: Set<string>;
  imgBaseFor: (id: string) => string;
}) {
  const selectClass =
    "text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]";

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <select
          value={relicRarity}
          onChange={(e) => setRelicRarity(e.target.value)}
          className={selectClass}
        >
          <option value="">All Rarities</option>
          {relicRarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} relics</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">No relics match.</div>
      ) : (
        <div className="overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
                <SortHeader column="name" current={relicSort} onClick={setRelicSort} align="left">
                  Relic
                </SortHeader>
                <SortHeader column="pick_rate" current={relicSort} onClick={setRelicSort}>
                  Pick Rate
                </SortHeader>
                <SortHeader column="win_pct" current={relicSort} onClick={setRelicSort}>
                  Win Rate
                </SortHeader>
                <SortHeader column="count" current={relicSort} onClick={setRelicSort}>
                  Count
                </SortHeader>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]/60 transition-colors"
                >
                  <td className="py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                  <td className="py-2 min-w-[200px]">
                    <EntityRowPill
                      kind="relic"
                      id={r.id}
                      name={r.name}
                      imageSrc={r.image_url ? `${imgBaseFor(r.id)}${r.image_url}` : null}
                      subtitle={r.rarity || "—"}
                      description={r.description}
                      lp={lp}
                      isBeta={betaIds.has(r.id)}
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end">
                      <PercentBar value={r.pick_rate} color={pickRateColor(r.pick_rate)} />
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end">
                      {r.total_runs_with > 0 ? (
                        <PercentBar value={r.win_pct} color={winRateColor(r.win_pct)} />
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums">
                    {r.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Potions ------------------------- */

interface PotionRow {
  id: string;
  name: string;
  rarity: string;
  image_url: string | null;
  description: string;
  offered: number;
  picked: number;
  used: number;
  total_runs_with: number;
  win_runs: number;
  pick_rate: number;
  use_rate: number;
  win_pct: number;
}

function PotionsTab({
  rows,
  potionRarities,
  potionRarity,
  setPotionRarity,
  potionSort,
  setPotionSort,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: PotionRow[];
  potionRarities: string[];
  potionRarity: string;
  setPotionRarity: (s: string) => void;
  potionSort: PotionSort;
  setPotionSort: (s: PotionSort) => void;
  lp: string;
  betaIds: Set<string>;
  imgBaseFor: (id: string) => string;
}) {
  const selectClass =
    "text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]";

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <select
          value={potionRarity}
          onChange={(e) => setPotionRarity(e.target.value)}
          className={selectClass}
        >
          <option value="">All Rarities</option>
          {potionRarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} potions</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">No potions match.</div>
      ) : (
        <div className="overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
                <SortHeader column="name" current={potionSort} onClick={setPotionSort} align="left">
                  Potion
                </SortHeader>
                <SortHeader column="pick_rate" current={potionSort} onClick={setPotionSort}>
                  Pick Rate
                </SortHeader>
                <SortHeader column="use_rate" current={potionSort} onClick={setPotionSort}>
                  Use Rate
                </SortHeader>
                <SortHeader column="win_pct" current={potionSort} onClick={setPotionSort}>
                  Win Rate
                </SortHeader>
                <SortHeader column="count" current={potionSort} onClick={setPotionSort}>
                  Count
                </SortHeader>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]/60 transition-colors"
                >
                  <td className="py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                  <td className="py-2 min-w-[200px]">
                    <EntityRowPill
                      kind="potion"
                      id={r.id}
                      name={r.name}
                      imageSrc={r.image_url ? `${imgBaseFor(r.id)}${r.image_url}` : null}
                      subtitle={r.rarity || "—"}
                      description={r.description}
                      lp={lp}
                      isBeta={betaIds.has(r.id)}
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end">
                      {r.offered > 0 ? (
                        <PercentBar value={r.pick_rate} color={pickRateColor(r.pick_rate)} />
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end">
                      {r.picked > 0 ? (
                        <PercentBar value={r.use_rate} color="#22d3ee" />
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end">
                      {r.total_runs_with > 0 ? (
                        <PercentBar value={r.win_pct} color={winRateColor(r.win_pct)} />
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums">
                    {r.total_runs_with}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Encounters ------------------------- */

function EncountersTab({ stats, lp }: { stats: CommunityStats; lp: string }) {
  if (!stats.deadliest || stats.deadliest.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 text-center text-sm text-[var(--text-muted)]">
        No deadly encounters recorded.
      </div>
    );
  }
  const max = Math.max(1, ...stats.deadliest.map((d) => d.count));
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
        Deadliest Encounters
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-xs">
            <th className="text-left py-2 font-medium w-10">#</th>
            <th className="text-left py-2 font-medium">Encounter</th>
            <th className="text-right py-2 font-medium">Deaths</th>
            <th className="py-2 font-medium w-48"></th>
          </tr>
        </thead>
        <tbody>
          {stats.deadliest.map((d, i) => (
            <tr
              key={d.encounter}
              className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]/60 transition-colors"
            >
              <td className="py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
              <td className="py-2">
                <Link
                  href={`${lp}/encounters/${d.encounter.toLowerCase()}`}
                  className="text-[var(--text-primary)] hover:text-[var(--accent-gold)] font-medium transition-colors"
                >
                  {displayName(`ENCOUNTER.${d.encounter}`)}
                </Link>
              </td>
              <td className="py-2 text-right text-red-400 tabular-nums font-semibold">
                {d.count}
              </td>
              <td className="py-2 pl-4">
                <div className="h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400/70"
                    style={{ width: `${(d.count / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
