"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "@/app/components/RichDescription";
import { fullCardUrl } from "@/lib/image-url";
import { characterHex } from "@/lib/character-colors";
import StatsRebuildingNotice from "@/app/components/StatsRebuildingNotice";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  unique_players: number;
  total_cards_picked: number;
  filters: {
    character: string | null;
    win: string | null;
    ascension: string | null;
    game_mode: string | null;
    players: string | null;
  };
  characters: { character: string; total: number; wins: number; win_rate: number }[];
  ascensions: { level: number; total: number; wins: number; win_rate: number }[];
  winning_cards_by_character?: Record<string, { card_id: string; count: number }[]>;
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
  const { lang } = useLanguage();
  const href = isBeta
    ? `${lp}/beta/${kind}s/${id.toLowerCase()}`
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
      {show && kind === "card" && (
        // Cards pop the full rendered card image, not the text tooltip.
        <span className="pointer-events-none absolute z-[100] bottom-full left-0 mb-2 w-40">
          <img
            src={fullCardUrl(id.toLowerCase(), false, "stable", lang)}
            alt=""
            className="w-40 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
            crossOrigin="anonymous"
            onError={(e) => {
              if (imageSrc) (e.target as HTMLImageElement).src = imageSrc;
            }}
          />
        </span>
      )}
      {show && kind !== "card" && (
        <span className="absolute z-[100] bottom-full left-0 mb-2 w-60 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left">
          <span className="flex items-start gap-2 mb-1.5">
            {imageSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt=""
                className="w-8 h-8 object-contain"
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

type CardSort = "pick_rate" | "win_pct" | "elo" | "count" | "name";
type RelicSort = "pick_rate" | "win_pct" | "count" | "name";
type PotionSort = "pick_rate" | "use_rate" | "win_pct" | "count" | "name";
type SortDir = "asc" | "desc";

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
  const { lang } = useLanguage();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, PotionInfo>>({});
  const [betaIds, setBetaIds] = useState<Set<string>>(new Set());
  // Codex Elo per card id, from the scores endpoint (reward-pick cards only;
  // curses, statuses, events, tokens, and starters have none).
  const [eloMap, setEloMap] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  // Top-level filters
  const [character, setCharacter] = useState("");
  const [winFilter, setWinFilter] = useState("");
  const [ascension, setAscension] = useState("");
  // Single-player vs multiplayer vs all. Empty string = all (default,
  // stats include both pools). Matches the backend `?players=` filter
  // on /api/runs/stats. Multiplayer runs are stored as one document
  // per player (player_count > 1), so leaving the filter off gives
  // the full population.
  const [players, setPlayers] = useState<"" | "single" | "multi">("");

  // Tabs
  const [tab, setTab] = useState<TopTab>("overview");

  // Card filters
  const [cardType, setCardType] = useState("");
  const [cardRarity, setCardRarity] = useState("");
  const [cardCost, setCardCost] = useState("");
  const [cardSort, setCardSort] = useState<CardSort>("pick_rate");
  const [cardDir, setCardDir] = useState<SortDir>("desc");

  // Relic filters
  const [relicRarity, setRelicRarity] = useState("");
  const [relicSort, setRelicSort] = useState<RelicSort>("pick_rate");
  const [relicDir, setRelicDir] = useState<SortDir>("desc");

  // Potion filters
  const [potionRarity, setPotionRarity] = useState("");
  const [potionSort, setPotionSort] = useState<PotionSort>("pick_rate");
  const [potionDir, setPotionDir] = useState<SortDir>("desc");

  // Clicking a column header sorts by it; clicking the active column again
  // toggles asc/desc. New columns default to descending, except name (A→Z).
  const onCardHeader = (col: CardSort) => {
    if (col === cardSort) setCardDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setCardSort(col); setCardDir(col === "name" ? "asc" : "desc"); }
  };
  const onRelicHeader = (col: RelicSort) => {
    if (col === relicSort) setRelicDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setRelicSort(col); setRelicDir(col === "name" ? "asc" : "desc"); }
  };
  const onPotionHeader = (col: PotionSort) => {
    if (col === potionSort) setPotionDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setPotionSort(col); setPotionDir(col === "name" ? "asc" : "desc"); }
  };

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

      // Codex Elo rides along; best-effort, the column just stays empty.
      cachedFetch<Record<string, { elo: number | null }>>(
        `${API}/api/runs/scores/cards`
      )
        .then((scores) => {
          const em: Record<string, number | null> = {};
          for (const [id, s] of Object.entries(scores)) em[id] = s.elo;
          setEloMap(em);
        })
        .catch(() => {});

      // Merge beta-only entities
      try {
        const [betaCards, betaRelics, betaPotions] = await Promise.all([
          cachedFetch<CardInfo[]>(`${API}/api/cards?channel=beta`),
          cachedFetch<RelicInfo[]>(`${API}/api/relics?channel=beta`),
          cachedFetch<PotionInfo[]>(`${API}/api/potions?channel=beta`),
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
        // Beta API unavailable, no problem
      }
    }
    loadEntityData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (character) params.set("character", character);
    if (winFilter) params.set("win", winFilter);
    if (ascension) params.set("ascension", ascension);
    if (players) params.set("players", players);
    setLoading(true);
    fetch(`${API}/api/runs/stats?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStats(d))
      .finally(() => setLoading(false));
  }, [character, winFilter, ascension, players]);

  // One API for both channels now: beta entities' art serves from the main
  // backend/CDN since the beta site merged into the main deployment.
  const imgBaseFor = (_id: string) => API;

  // Build combined card table
  const cardRows = useMemo(() => {
    if (!stats || stats.total_runs === 0) return [];
    const pickMap = new Map((stats.pick_rates || []).map((p) => [p.card_id, p]));
    const deckMap = new Map((stats.top_cards || []).map((c) => [c.card_id, c]));
    const allIds = new Set<string>([...pickMap.keys(), ...deckMap.keys()]);
    // Only official (Megacrit) cards: a run can carry modded cards whose ids
    // aren't in the game data; those have no entry in cardData and would
    // otherwise render with a raw "—CARD_ID" fallback name.
    const rows = [...allIds]
      .filter((id) => cardData[id])
      .map((id) => {
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
        elo: eloMap[id] ?? null,
      };
    });
    return rows;
  }, [stats, cardData, eloMap]);

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
    const mul = cardDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      let v = 0;
      if (cardSort === "name") v = a.name.localeCompare(b.name);
      else if (cardSort === "pick_rate") v = a.pick_rate - b.pick_rate || a.offered - b.offered;
      else if (cardSort === "win_pct") v = a.win_pct - b.win_pct || a.win_runs - b.win_runs;
      // Cards without an Elo (not reward picks) sink to the bottom either way.
      else if (cardSort === "elo") v = (a.elo ?? -1e9) - (b.elo ?? -1e9);
      else if (cardSort === "count") v = a.count - b.count;
      return mul * v;
    });
    return filtered;
  }, [cardRows, cardType, cardRarity, cardCost, cardSort, cardDir]);

  // Relics
  const relicRows = useMemo(() => {
    if (!stats || stats.total_runs === 0) return [];
    // Official relics only (drop modded relic ids not in the game data).
    return (stats.top_relics || [])
      .filter((r) => relicData[r.relic_id])
      .map((r) => {
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
    const mul = relicDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      let v = 0;
      if (relicSort === "name") v = a.name.localeCompare(b.name);
      else if (relicSort === "pick_rate") v = a.pick_rate - b.pick_rate || a.count - b.count;
      else if (relicSort === "win_pct") v = a.win_pct - b.win_pct || a.win_runs - b.win_runs;
      else if (relicSort === "count") v = a.count - b.count;
      return mul * v;
    });
    return filtered;
  }, [relicRows, relicRarity, relicSort, relicDir]);

  // Potions
  const potionRows = useMemo(() => {
    if (!stats || stats.total_runs === 0) return [];
    // Official potions only (drop modded potion ids not in the game data).
    return (stats.top_potions || [])
      .filter((p) => potionData[p.potion_id])
      .map((p) => {
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
    const mul = potionDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      let v = 0;
      if (potionSort === "name") v = a.name.localeCompare(b.name);
      else if (potionSort === "pick_rate") v = a.pick_rate - b.pick_rate || a.offered - b.offered;
      else if (potionSort === "use_rate") v = a.use_rate - b.use_rate || a.used - b.used;
      else if (potionSort === "win_pct") v = a.win_pct - b.win_pct || a.win_runs - b.win_runs;
      else if (potionSort === "count") v = a.total_runs_with - b.total_runs_with;
      return mul * v;
    });
    return filtered;
  }, [potionRows, potionRarity, potionSort, potionDir]);

  if (loading && !stats) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  const TABS: { key: TopTab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "cards", label: t("Cards", lang) },
    { key: "relics", label: t("Relics", lang) },
    { key: "potions", label: t("Potions", lang) },
    { key: "encounters", label: t("Encounters", lang) },
  ];

  const selectClass =
    "text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <StatsRebuildingNotice />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Stats", lang)}</span>
      </h1>
      <p className="text-[var(--text-secondary)] mb-3">
        {stats?.total_runs || 0} runs analyzed.{" "}
        <Link
          href={`${lp}/leaderboards/submit`}
          className="text-[var(--accent-gold)] hover:underline"
        >
          Submit yours
        </Link>{" "}
        to contribute.
      </p>

      {/* Jumping-off points to the deeper views built on the same run data. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6 text-xs">
        <span className="text-[var(--text-muted)] mr-1">Dig deeper:</span>
        {[
          { href: "/charts", label: "Run Charts" },
          { href: "/community-stats", label: "Community Stats" },
          { href: "/leaderboards/metrics", label: "Card Metrics" },
          { href: "/tier-list", label: "Tier List" },
          { href: "/leaderboards/scoring", label: "How scoring works" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="px-3 py-1.5 rounded-md border bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Player-mode toggle, visually identical to LeaderboardBrowseClient's
          mode pills (same wrapper, padding, colors) so the two pages
          read as one design language. "All" is the default here
          because aggregate stats are most useful when not artificially
          narrowed; leaderboards default to "single" because rankings
          across SP/MP pools aren't comparable. */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="inline-flex gap-1 p-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          {([
            { value: "" as const, label: t("All", lang) },
            { value: "single" as const, label: t("Single Player", lang) },
            { value: "multi" as const, label: t("Multiplayer", lang) },
          ]).map(({ value, label }) => (
            <button
              key={value || "all"}
              onClick={() => setPlayers(value)}
              className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                players === value
                  ? "bg-[var(--accent-gold)] text-[var(--bg-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Global filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
          className={selectClass}
          style={{
            borderColor: character ? characterHex(character) : undefined,
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
          <option value="">{t("All", lang)}</option>
          <option value="true">{t("Wins", lang)}</option>
          <option value="false">{t("Losses", lang)}</option>
          <option value="abandoned">{t("Abandoned", lang)}</option>
        </select>
        {loading && (
          <span className="text-xs text-[var(--text-muted)] self-center">{t("Loading...", lang)}</span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)] overflow-x-auto no-scrollbar">
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
          {t("No runs found.", lang)}
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <OverviewTab
              stats={stats}
              onCharacterClick={setCharacter}
              lang={lang}
              lp={lp}
            />
          )}
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
              cardDir={cardDir}
              onCardHeader={onCardHeader}
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
              relicDir={relicDir}
              onRelicHeader={onRelicHeader}
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
              potionDir={potionDir}
              onPotionHeader={onPotionHeader}
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
  lang,
  lp,
}: {
  stats: CommunityStats;
  onCharacterClick: (c: string) => void;
  lang: string;
  lp: string;
}) {
  const losses =
    (stats.total_runs || 0) - (stats.total_wins || 0) - (stats.total_abandoned || 0);

  const maxCharTotal = Math.max(1, ...stats.characters.map((c) => c.total));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
              {stats.total_runs.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)]">{t("Runs", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-emerald-400 tabular-nums">
              {stats.total_wins.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)]">{t("Wins", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-red-400 tabular-nums">
              {losses.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)]">{t("Losses", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">
              {stats.win_rate}%
            </div>
            <div className="text-xs text-[var(--text-muted)]">{t("Win %", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
              {(stats.unique_players ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Named players</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
              {(stats.total_cards_picked ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Cards picked</div>
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
              const charColor = characterHex(c.character) || "var(--text-muted)";
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

      {/* Top winning cards per character — community-wide signal of
          which cards anchor winning decks for each archetype. Always
          unfiltered: collapses to a tautology if narrowed to one
          character, so we hide it when the user has filtered down. */}
      {!stats.filters.character &&
        stats.winning_cards_by_character &&
        Object.keys(stats.winning_cards_by_character).length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
              Top winning cards by character
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              The five most-frequent cards in winning decks per character. Community-wide; filters above don&apos;t apply here.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {CHARACTERS.map((char) => {
                const rows = stats.winning_cards_by_character?.[char] ?? [];
                if (rows.length === 0) return null;
                const color = CHAR_COLORS[char] || "var(--text-muted)";
                return (
                  <div
                    key={char}
                    className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]"
                  >
                    <div
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color }}
                    >
                      {displayName(`CHARACTER.${char}`)}
                    </div>
                    <ol className="space-y-1 text-sm">
                      {rows.map((c, i) => (
                        <li
                          key={c.card_id}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <Link
                            href={`${lp ? `/${lp}` : ""}/cards/${c.card_id.toLowerCase()}`}
                            className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:underline truncate"
                          >
                            <span className="text-[var(--text-muted)] mr-1">
                              {i + 1}.
                            </span>
                            {displayName(`CARD.${c.card_id}`)}
                          </Link>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums shrink-0">
                            {c.count}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
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
  elo: number | null;
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
  cardDir,
  onCardHeader,
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
  cardDir: SortDir;
  onCardHeader: (col: CardSort) => void;
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
        cardDir={cardDir}
        onCardHeader={onCardHeader}
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
  dir = "desc",
  onClick,
  children,
  align = "right",
}: {
  column: T;
  current: T;
  dir?: SortDir;
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
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function CardTable({
  rows,
  cardSort,
  cardDir,
  onCardHeader,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: CardRow[];
  cardSort: CardSort;
  cardDir: SortDir;
  onCardHeader: (col: CardSort) => void;
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
    <div className="overflow-x-auto md:overflow-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
            <SortHeader column="name" current={cardSort} dir={cardDir} onClick={onCardHeader} align="left">
              Card
            </SortHeader>
            <SortHeader column="pick_rate" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              Pick Rate
            </SortHeader>
            <SortHeader column="win_pct" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              Win Rate
            </SortHeader>
            <SortHeader column="elo" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              Codex Elo
            </SortHeader>
            <SortHeader column="count" current={cardSort} dir={cardDir} onClick={onCardHeader}>
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
              <td className="py-2 text-right tabular-nums">
                {r.elo != null ? (
                  <span className="text-[var(--accent-gold)]">{Math.round(r.elo)}</span>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                )}
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
  relicDir,
  onRelicHeader,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: RelicRow[];
  relicRarities: string[];
  relicRarity: string;
  setRelicRarity: (s: string) => void;
  relicSort: RelicSort;
  relicDir: SortDir;
  onRelicHeader: (col: RelicSort) => void;
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
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
                <SortHeader column="name" current={relicSort} dir={relicDir} onClick={onRelicHeader} align="left">
                  Relic
                </SortHeader>
                <SortHeader column="pick_rate" current={relicSort} dir={relicDir} onClick={onRelicHeader}>
                  Pick Rate
                </SortHeader>
                <SortHeader column="win_pct" current={relicSort} dir={relicDir} onClick={onRelicHeader}>
                  Win Rate
                </SortHeader>
                <SortHeader column="count" current={relicSort} dir={relicDir} onClick={onRelicHeader}>
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
  potionDir,
  onPotionHeader,
  lp,
  betaIds,
  imgBaseFor,
}: {
  rows: PotionRow[];
  potionRarities: string[];
  potionRarity: string;
  setPotionRarity: (s: string) => void;
  potionSort: PotionSort;
  potionDir: SortDir;
  onPotionHeader: (col: PotionSort) => void;
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
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
                <SortHeader column="name" current={potionSort} dir={potionDir} onClick={onPotionHeader} align="left">
                  Potion
                </SortHeader>
                <SortHeader column="pick_rate" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  <span title="How often a potion is bought when it appears on a shop shelf. Combat-drop potions are excluded: with an open slot you take almost every free potion, so drop pick-rate just measures slot availability, not quality. A shop buy is a real gold decision.">
                    Shop Buy %
                  </span>
                </SortHeader>
                <SortHeader column="use_rate" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  Use Rate
                </SortHeader>
                <SortHeader column="win_pct" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  Win Rate
                </SortHeader>
                <SortHeader column="count" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
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
