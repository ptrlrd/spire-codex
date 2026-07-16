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
import { CONTENT_BRACKETS, combineBracket } from "@/lib/content-brackets";
import { Pills, PLAYER_OPTS } from "@/app/components/PlayerCountPills";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// One entity's per-bracket slice from /api/runs/scores/{type}?bracket= (or,
// with a character selected, from /api/runs/metrics/{type} mapped to the same
// shape). Used when a content bracket is active, in place of the get_stats
// top-N lists.
interface BracketScore {
  score: number | null;
  elo: number | null;
  picks: number;
  wins: number;
  win_rate: number;
  pick_rate: number;
  // Only on metrics-sourced rows (cards): reward-screen counts, so the Pick
  // Rate column is the real per-bracket reward pick rate.
  offered?: number;
  picked?: number;
}

// A /api/runs/metrics/{type} row (only the fields this page reads).
interface MetricsRow {
  id: string;
  score: number | null;
  elo: number | null;
  win_rate: number | null;
  pick_rate: number | null;
  picks: number;
  wins: number;
  offered: number;
  picked: number;
}

// The community-stats blob slices this page reads for the bracket overview.
interface BracketOverview {
  total_runs: number;
  total_wins: number;
  win_rate: number;
  by_ascension: { ascension: number; runs: number; wins: number; win_rate: number }[];
  by_character: { id: string; runs: number; wins: number; win_rate: number }[];
}

// The live path filters by ?players= (1-4); the snapshot path slices by the
// solo/2p/3p/4p brackets. Same cut, two vocabularies.
const PLAYERS_TO_BRACKET: Record<string, string> = {
  "1": "solo",
  "2": "2p",
  "3": "3p",
  "4": "4p",
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
  const [players, setPlayers] = useState("");

  // Content bracket (All / A10 / A10 >X% WR). When set to anything but "all",
  // everything sources from the pre-built stats snapshot instead of the live
  // get_stats query: the overview reads the community blob, the card/relic/
  // potion tabs read the entity snapshot (the only places the win-rate
  // brackets exist). Player count and character still combine with it —
  // players maps onto the solo/2p/3p/4p bracket axis, character onto the
  // per-bracket by_character splits. Win and ascension have no snapshot
  // dimension, so those two grey out.
  const [bracket, setBracket] = useState("all");
  const [bracketScores, setBracketScores] = useState<
    Record<EntityKind, Record<string, BracketScore>> | null
  >(null);
  const [bracketOverview, setBracketOverview] = useState<BracketOverview | null>(null);
  const [bracketLoading, setBracketLoading] = useState(false);
  const [statVersions, setStatVersions] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatVersions(d?.stat_versions || []))
      .catch(() => {});
  }, []);
  const bracketActive = bracket !== "all";
  const isVersion = /^v\d/.test(bracket);
  // The ?bracket= value combining both axes, e.g. "wr50", "solo:wr50".
  // A version bracket is exclusive: it never composes with player counts.
  const apiBracket = isVersion
    ? bracket
    : combineBracket(PLAYERS_TO_BRACKET[players] ?? "", bracketActive ? bracket : "");

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

  // Per-bracket entity data, fetched only when a bracket is active. Cards come
  // from /api/runs/metrics: it's the only endpoint that combines bracket x
  // character (via the snapshot's by_character splits), and its bracket rows
  // carry real reward offered/picked counts, so Pick Rate keeps meaning reward
  // pick rate. Relics and potions come from /api/runs/scores (inclusion pick
  // rates) unless a character is set, which only metrics can slice. Character
  // rows carry Win% only — Elo and Pick% aren't tracked per character, those
  // columns go blank.
  useEffect(() => {
    if (!bracketActive) {
      setBracketScores(null);
      return;
    }
    let cancelled = false;
    const fromMetrics = (kind: EntityKind): Promise<Record<string, BracketScore>> => {
      const params = new URLSearchParams({ bracket: apiBracket });
      if (character) params.set("character", character);
      return cachedFetch<{ rows: MetricsRow[] }>(
        `${API}/api/runs/metrics/${kind}s?${params}`,
      ).then((d) => {
        const out: Record<string, BracketScore> = {};
        for (const row of d.rows || []) {
          out[row.id] = {
            score: row.score,
            elo: row.elo,
            picks: row.picks,
            wins: row.wins,
            win_rate: row.win_rate ?? 0,
            pick_rate: row.pick_rate ?? 0,
            offered: row.offered,
            picked: row.picked,
          };
        }
        return out;
      });
    };
    const fetchType = (kind: EntityKind): Promise<Record<string, BracketScore>> => {
      if (kind === "card" || character) return fromMetrics(kind);
      return cachedFetch<Record<string, BracketScore>>(
        `${API}/api/runs/scores/${kind}s?bracket=${encodeURIComponent(apiBracket)}`,
      );
    };
    Promise.all([fetchType("card"), fetchType("relic"), fetchType("potion")])
      .then(([card, relic, potion]) => {
        if (!cancelled) setBracketScores({ card, relic, potion });
      })
      .catch(() => {
        if (!cancelled) setBracketScores(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bracketActive, apiBracket, character]);

  // Bracket overview: the community-stats blob materializes every bracket
  // (including the player:skill composites), so the Overview tab's totals,
  // character win rates, and ascension table can follow the bracket instead
  // of freezing on the live all-runs numbers.
  useEffect(() => {
    if (!bracketActive) {
      setBracketOverview(null);
      return;
    }
    let cancelled = false;
    setBracketLoading(true);
    cachedFetch<BracketOverview>(
      `${API}/api/runs/community-stats?bracket=${encodeURIComponent(apiBracket)}`,
    )
      .then((d) => {
        if (!cancelled) setBracketOverview(d);
      })
      .catch(() => {
        if (!cancelled) setBracketOverview(null);
      })
      .finally(() => {
        if (!cancelled) setBracketLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bracketActive, apiBracket]);

  // What the header, overview tab, and empty-state gate render: the live
  // get_stats response normally, or a pseudo-stats built from the bracket's
  // community blob when a bracket is active. With a character selected the
  // totals come from that character's row; the ascension split isn't tracked
  // per character in the snapshot, so it hides rather than showing an
  // unfiltered table.
  const viewStats: CommunityStats | null = useMemo(() => {
    if (!bracketActive) return stats;
    if (!bracketOverview) return null;
    const rows = bracketOverview.by_character || [];
    const selected = character
      ? rows.filter((c) => c.id === character.toLowerCase())
      : rows;
    const totalRuns = character
      ? selected.reduce((n, c) => n + c.runs, 0)
      : bracketOverview.total_runs;
    const totalWins = character
      ? selected.reduce((n, c) => n + c.wins, 0)
      : bracketOverview.total_wins;
    return {
      total_runs: totalRuns,
      total_wins: totalWins,
      total_abandoned: 0,
      win_rate: character
        ? totalRuns > 0
          ? Math.round((totalWins / totalRuns) * 1000) / 10
          : 0
        : bracketOverview.win_rate,
      filters: {
        character: character || null,
        win: null,
        ascension: null,
        game_mode: null,
        players: players || null,
      },
      characters: selected.map((c) => ({
        character: c.id.toUpperCase(),
        total: c.runs,
        wins: c.wins,
        win_rate: c.win_rate,
      })),
      ascensions: character
        ? []
        : (bracketOverview.by_ascension || []).map((a) => ({
            level: a.ascension,
            total: a.runs,
            wins: a.wins,
            win_rate: a.win_rate,
          })),
      top_cards: [],
      pick_rates: [],
      top_relics: [],
      top_potions: [],
      deadliest: [],
    };
  }, [bracketActive, bracketOverview, stats, character, players]);

  // One API for both channels now: beta entities' art serves from the main
  // backend/CDN since the beta site merged into the main deployment.
  const imgBaseFor = (_id: string) => API;

  // Build combined card table
  const cardRows = useMemo(() => {
    if (bracketActive) {
      const bs = bracketScores?.card;
      if (!bs) return [];
      return Object.keys(bs)
        .filter((id) => cardData[id])
        .map((id) => {
          const s = bs[id];
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
            offered: s.offered ?? 0,
            picked: s.picked ?? 0,
            pick_rate: s.pick_rate ?? 0,
            count: s.picks ?? 0,
            win_runs: s.wins ?? 0,
            total_runs_with: s.picks ?? 0,
            win_pct: s.win_rate ?? 0,
            elo: s.elo ?? null,
          };
        });
    }
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
  }, [stats, cardData, eloMap, bracketActive, bracketScores]);

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
    if (bracketActive) {
      const bs = bracketScores?.relic;
      if (!bs) return [];
      return Object.keys(bs)
        .filter((id) => relicData[id])
        .map((id) => {
          const s = bs[id];
          const info = relicData[id];
          return {
            id,
            name: info?.name || displayName(`RELIC.${id}`),
            rarity: info?.rarity || "",
            image_url: info?.image_url || null,
            description: info?.description || "",
            count: s.picks ?? 0,
            total_runs_with: s.picks ?? 0,
            win_runs: s.wins ?? 0,
            pick_rate: s.pick_rate ?? 0,
            win_pct: s.win_rate ?? 0,
          };
        });
    }
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
  }, [stats, relicData, bracketActive, bracketScores]);

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
    if (bracketActive) {
      const bs = bracketScores?.potion;
      if (!bs) return [];
      return Object.keys(bs)
        .filter((id) => potionData[id])
        .map((id) => {
          const s = bs[id];
          const info = potionData[id];
          return {
            id,
            name: info?.name || displayName(`POTION.${id}`),
            rarity: info?.rarity || "",
            image_url: info?.image_url || null,
            description: info?.description || "",
            offered: 0,
            picked: 0,
            used: 0,
            total_runs_with: s.picks ?? 0,
            win_runs: s.wins ?? 0,
            pick_rate: s.pick_rate ?? 0,
            use_rate: 0,
            win_pct: s.win_rate ?? 0,
          };
        });
    }
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
  }, [stats, potionData, bracketActive, bracketScores]);

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
    // Keep the page header in the pre-data render: this branch is what
    // server-side rendering emits, so without the h1 here the crawled HTML
    // had no heading at all.
    return (
      <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-[var(--accent-gold)]">{t("Stats", lang)}</span>
        </h1>
        <div className="max-w-5xl py-12 text-center text-[var(--text-muted)]">
          {t("Loading...", lang)}
        </div>
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
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <StatsRebuildingNotice />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Stats", lang)}</span>
      </h1>
      <p className="text-[var(--text-secondary)] mb-3">
        {viewStats?.total_runs || 0} {t("runs analyzed.", lang)}{" "}
        <Link
          href={`${lp}/leaderboards/submit`}
          className="text-[var(--accent-gold)] hover:underline"
        >
          {t("Submit yours", lang)}
        </Link>{" "}
        {t("to contribute.", lang)}
      </p>

      {/* Jumping-off points to the deeper views built on the same run data. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6 text-xs">
        <span className="text-[var(--text-muted)] mr-1">{t("Dig deeper:", lang)}</span>
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
            {t(l.label, lang)}
          </Link>
        ))}
      </div>

      {/* Content bracket selector. When set past "All" the page sources from
          the stats snapshot (the only place the win-rate brackets exist);
          player count and character keep combining with it, win/ascension
          grey out. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[var(--text-muted)] mr-1">{t("Bracket", lang)}</span>
        {CONTENT_BRACKETS.map((b) => {
          const isActive = bracket === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setBracket(b.key)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {t(b.label, lang)}
            </button>
          );
        })}
        {statVersions.length > 0 && (
          <select
            value={isVersion ? bracket : ""}
            onChange={(e) => setBracket(e.target.value || "all")}
            className="text-xs px-2 py-1.5 rounded-md border bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
            aria-label="Game version"
          >
            <option value="">{t("All versions", lang)}</option>
            {statVersions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        {bracketActive && (
          <span className="text-xs text-[var(--text-muted)] ml-1">
            {t("Result and ascension filters don't apply within a bracket.", lang)}
          </span>
        )}
        {bracketActive && character && (
          <span className="text-xs text-[var(--text-muted)] ml-1">
            {t("Character rows carry Codex Score and Win% only. Elo and Pick% aren't tracked per character.", lang)}
          </span>
        )}
      </div>

      {/* Player-mode toggle, visually identical to LeaderboardBrowseClient's
          mode pills (same wrapper, padding, colors) so the two pages
          read as one design language. "All" is the default here
          because aggregate stats are most useful when not artificially
          narrowed; leaderboards default to "single" because rankings
          across SP/MP pools aren't comparable. */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Pills
          options={PLAYER_OPTS}
          value={players}
          onChange={setPlayers}
          ariaLabel={t("Filter by player count", lang)}
        />
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
          <option value="">{t("All Characters", lang)}</option>
          {CHARACTERS.map((c) => (
            <option key={c} value={c}>
              {displayName(`CHARACTER.${c}`)}
            </option>
          ))}
        </select>
        <select
          value={ascension}
          onChange={(e) => setAscension(e.target.value)}
          disabled={bracketActive}
          className={`${selectClass}${bracketActive ? " opacity-40 pointer-events-none" : ""}`}
        >
          <option value="">{t("All Ascensions", lang)}</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={String(i)}>
              {t("Ascension", lang)} {i}
            </option>
          ))}
        </select>
        <select
          value={winFilter}
          onChange={(e) => setWinFilter(e.target.value)}
          disabled={bracketActive}
          className={`${selectClass}${bracketActive ? " opacity-40 pointer-events-none" : ""}`}
        >
          <option value="">{t("All", lang)}</option>
          <option value="true">{t("Wins", lang)}</option>
          <option value="false">{t("Losses", lang)}</option>
          <option value="abandoned">{t("Abandoned", lang)}</option>
        </select>
        {(loading || bracketLoading) && (
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

      {!viewStats ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {loading || bracketLoading ? t("Loading...", lang) : t("No runs found.", lang)}
        </div>
      ) : viewStats.total_runs === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("No runs found.", lang)}
        </div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab stats={viewStats} onCharacterClick={setCharacter} lang={lang} />}
          {tab === "cards" && (
            <CardsTab
              rows={filteredCards}
              totalRuns={viewStats.total_runs}
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
              lang={lang}
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
              lang={lang}
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
              lang={lang}
            />
          )}
          {tab === "encounters" && <EncountersTab lp={lp} lang={lang} />}
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
}: {
  stats: CommunityStats;
  onCharacterClick: (c: string) => void;
  lang: string;
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
            <div className="text-xs text-[var(--text-muted)]">{t("Runs", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-emerald-400">{stats.total_wins}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("Wins", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-red-400">{losses}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("Losses", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-2xl font-bold text-[var(--accent-gold)]">
              {stats.win_rate}%
            </div>
            <div className="text-xs text-[var(--text-muted)]">{t("Win %", lang)}</div>
          </div>
        </div>
      </div>

      {stats.characters && stats.characters.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            {t("Character Win Rates", lang)}
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
            {t("Ascension Breakdown", lang)}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium">{t("Ascension", lang)}</th>
                <th className="text-right py-2 font-medium">{t("Runs", lang)}</th>
                <th className="text-right py-2 font-medium">{t("Wins", lang)}</th>
                <th className="text-right py-2 font-medium">{t("Losses", lang)}</th>
                <th className="text-right py-2 font-medium">{t("Win Rate", lang)}</th>
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
  elo: number | null;
}

function CardsTab({
  lang,
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
  lang: string;
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
            <option value="">{t("All Types", lang)}</option>
            {cardTypes.map((ct) => (
              <option key={ct} value={ct}>
                {ct}
              </option>
            ))}
          </select>
          <select
            value={cardRarity}
            onChange={(e) => setCardRarity(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("All Rarities", lang)}</option>
            {cardRarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={cardCost} onChange={(e) => setCardCost(e.target.value)} className={selectClass}>
            <option value="">{t("All Costs", lang)}</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4+</option>
            <option value="X">X</option>
          </select>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} {t("cards", lang)}</span>
      </div>

      <CardTable
        rows={rows}
        cardSort={cardSort}
        cardDir={cardDir}
        onCardHeader={onCardHeader}
        lp={lp}
        betaIds={betaIds}
        imgBaseFor={imgBaseFor}
        lang={lang}
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
  lang,
  rows,
  cardSort,
  cardDir,
  onCardHeader,
  lp,
  betaIds,
  imgBaseFor,
}: {
  lang: string;
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
      <div className="py-8 text-center text-sm text-[var(--text-muted)]">{t("No cards match.", lang)}</div>
    );
  }
  return (
    <div className="overflow-x-auto md:overflow-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
            <SortHeader column="name" current={cardSort} dir={cardDir} onClick={onCardHeader} align="left">
              {t("Card", lang)}
            </SortHeader>
            <SortHeader column="pick_rate" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              {t("Pick Rate", lang)}
            </SortHeader>
            <SortHeader column="win_pct" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              {t("Win Rate", lang)}
            </SortHeader>
            <SortHeader column="elo" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              Codex Elo
            </SortHeader>
            <SortHeader column="count" current={cardSort} dir={cardDir} onClick={onCardHeader}>
              {t("Count", lang)}
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
  lang,
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
  lang: string;
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
          <option value="">{t("All Rarities", lang)}</option>
          {relicRarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} {t("relics", lang)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">{t("No relics match.", lang)}</div>
      ) : (
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
                <SortHeader column="name" current={relicSort} dir={relicDir} onClick={onRelicHeader} align="left">
                  {t("Relic", lang)}
                </SortHeader>
                <SortHeader column="pick_rate" current={relicSort} dir={relicDir} onClick={onRelicHeader}>
                  {t("Pick Rate", lang)}
                </SortHeader>
                <SortHeader column="win_pct" current={relicSort} dir={relicDir} onClick={onRelicHeader}>
                  {t("Win Rate", lang)}
                </SortHeader>
                <SortHeader column="count" current={relicSort} dir={relicDir} onClick={onRelicHeader}>
                  {t("Count", lang)}
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
                      {/* Character-scoped bracket rows have no pick rate
                          (inclusion isn't tracked per character). */}
                      {r.pick_rate > 0 ? (
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
  lang,
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
  lang: string;
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
          <option value="">{t("All Rarities", lang)}</option>
          {potionRarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} {t("potions", lang)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">{t("No potions match.", lang)}</div>
      ) : (
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 font-medium text-[var(--text-muted)] w-10">#</th>
                <SortHeader column="name" current={potionSort} dir={potionDir} onClick={onPotionHeader} align="left">
                  {t("Potion", lang)}
                </SortHeader>
                <SortHeader column="pick_rate" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  <span title={t("How often a potion is bought when it appears on a shop shelf. Combat-drop potions are excluded: with an open slot you take almost every free potion, so drop pick-rate just measures slot availability, not quality. A shop buy is a real gold decision.", lang)}>
                    {t("Shop Buy %", lang)}
                  </span>
                </SortHeader>
                <SortHeader column="use_rate" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  {t("Use Rate", lang)}
                </SortHeader>
                <SortHeader column="win_pct" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  {t("Win Rate", lang)}
                </SortHeader>
                <SortHeader column="count" current={potionSort} dir={potionDir} onClick={onPotionHeader}>
                  {t("Count", lang)}
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

interface EncStatRow {
  encounter_id: string;
  total: number;
  fatal: number;
  room_type?: string;
  act?: number | string;
}

function EncountersTab({ lp, lang }: { lp: string; lang: string }) {
  const [rows, setRows] = useState<EncStatRow[] | null>(null);
  useEffect(() => {
    cachedFetch<{ encounters: EncStatRow[] }>(`${API}/api/runs/encounter-stats?limit=200`)
      .then((d) => setRows(d.encounters || []))
      .catch(() => setRows([]));
  }, []);

  // Rank by deaths *per encounter* (share of parties that die to a fight), not
  // raw death count — so rare-but-lethal bosses like Aeonglass rise to the top
  // instead of being buried under the common early fights. The min-sample gate
  // keeps a handful of unlucky runs from topping the list.
  const MIN_FACED = 200;
  const ranked = (rows ?? [])
    .filter((e) => e.total >= MIN_FACED)
    .map((e) => ({ ...e, rate: (e.fatal / e.total) * 100 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 30);

  if (rows === null) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 text-center text-sm text-[var(--text-muted)]">
        {t("Loading…", lang)}
      </div>
    );
  }
  if (ranked.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 text-center text-sm text-[var(--text-muted)]">
        {t("No deadly encounters recorded.", lang)}
      </div>
    );
  }
  const maxRate = Math.max(1, ...ranked.map((r) => r.rate));
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
        {t("Deadliest Encounters", lang)}
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {t("Ranked by deaths per encounter — the share of parties that die to a fight, not raw death count.", lang)}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-xs">
            <th className="text-left py-2 font-medium w-10">#</th>
            <th className="text-left py-2 font-medium">{t("Encounter", lang)}</th>
            <th className="text-right py-2 font-medium">{t("Per encounter", lang)}</th>
            <th className="text-right py-2 font-medium">{t("Deaths / faced", lang)}</th>
            <th className="py-2 font-medium w-40"></th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr
              key={r.encounter_id}
              className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]/60 transition-colors"
            >
              <td className="py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
              <td className="py-2">
                <Link
                  href={`${lp}/encounters/${r.encounter_id.toLowerCase()}`}
                  className="text-[var(--text-primary)] hover:text-[var(--accent-gold)] font-medium transition-colors"
                >
                  {displayName(`ENCOUNTER.${r.encounter_id}`)}
                </Link>
              </td>
              <td className="py-2 text-right text-red-400 tabular-nums font-semibold">
                {r.rate.toFixed(1)}%
              </td>
              <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums text-xs">
                {r.fatal.toLocaleString()} / {r.total.toLocaleString()}
              </td>
              <td className="py-2 pl-4">
                <div className="h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400/70"
                    style={{ width: `${(r.rate / maxRate) * 100}%` }}
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
