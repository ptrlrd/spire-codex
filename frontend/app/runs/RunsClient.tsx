"use client";

import { useState, useEffect, useRef } from "react";
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

function CardPill({
  cardId,
  upgraded,
  enchantment,
  cardData,
  lp,
  className,
  children,
}: {
  cardId: string;
  upgraded?: boolean;
  enchantment?: string;
  cardData: Record<string, CardInfo>;
  lp: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = cardData[cardId];

  return (
    <Link
      href={`${lp}/cards/${cardId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children || displayName(`CARD.${cardId}`)}
      {upgraded && "+"}
      {enchantment && <span className="text-purple-400 ml-1">[{displayName(`ENCHANTMENT.${enchantment}`)}]</span>}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img src={`${API}${info.image_url}`} alt="" className="w-10 h-10 object-cover rounded" crossOrigin="anonymous" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.type} · {info.rarity} · {info.cost}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

function RelicPill({
  relicId,
  relicData,
  lp,
  className,
  children,
}: {
  relicId: string;
  relicData: Record<string, RelicInfo>;
  lp: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = relicData[relicId];

  return (
    <Link
      href={`${lp}/relics/${relicId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children || displayName(`RELIC.${relicId}`)}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img src={`${API}${info.image_url}`} alt="" className="w-8 h-8 object-contain" crossOrigin="anonymous" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

interface RunCard {
  id: string;
  floor_added_to_deck?: number;
  current_upgrade_level?: number;
  enchantment?: { id: string; amount: number };
}

interface RunRelic {
  id: string;
  floor_added_to_deck?: number;
}

interface RunPlayer {
  character: string;
  deck: RunCard[];
  relics: RunRelic[];
  potions: string[];
  id: number;
}

interface CardChoice {
  card: { id: string };
  was_picked: boolean;
}

interface FloorPlayerStats {
  card_choices?: CardChoice[];
  cards_gained?: { id: string }[];
  current_hp: number;
  max_hp: number;
  current_gold: number;
  damage_taken: number;
  gold_gained: number;
  hp_healed: number;
  max_hp_gained: number;
  max_hp_lost: number;
  player_id: number;
}

interface FloorRoom {
  model_id: string;
  monster_ids?: string[];
  room_type: string;
  turns_taken?: number;
}

interface MapPoint {
  map_point_type: string;
  player_stats: FloorPlayerStats[];
  rooms?: FloorRoom[];
}

interface RunData {
  win: boolean;
  ascension: number;
  seed: string;
  run_time: number;
  game_mode: string;
  players: RunPlayer[];
  acts: string[];
  map_point_history: MapPoint[][];
  killed_by_encounter?: string;
  killed_by_event?: string;
  was_abandoned?: boolean;
  build_id?: string;
}

function cleanId(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT)\./, "");
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RunOverview({ run, cardData, relicData }: { run: RunData; cardData: Record<string, CardInfo>; relicData: Record<string, RelicInfo> }) {
  const lp = useLangPrefix();
  const player = run.players[0];
  const charId = cleanId(player.character);
  const charName = displayName(player.character);

  // Count non-starter cards
  const starterCards = player.deck.filter((c) => c.floor_added_to_deck === 1);
  const addedCards = player.deck.filter((c) => (c.floor_added_to_deck ?? 1) > 1);
  const upgradedCards = player.deck.filter((c) => c.current_upgrade_level);
  const enchantedCards = player.deck.filter((c) => c.enchantment);
  const totalFloors = run.map_point_history.reduce((sum, act) => sum + act.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-xl border p-5 ${run.win ? "bg-emerald-950/20 border-emerald-700/30" : "bg-red-950/20 border-red-700/30"}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${run.win ? "text-emerald-400" : "text-red-400"}`}>
              {run.win ? "Victory" : run.was_abandoned ? "Abandoned" : "Defeat"}
            </span>
            <Link href={`${lp}/characters/${charId.toLowerCase()}`} className="text-lg text-[var(--accent-gold)] hover:underline">
              {charName}
            </Link>
          </div>
          <div className="text-right text-sm text-[var(--text-muted)]">
            <div>Ascension {run.ascension}</div>
            <div>{formatTime(run.run_time)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{player.deck.length}</div>
            <div className="text-xs text-[var(--text-muted)]">Cards</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{player.relics.length}</div>
            <div className="text-xs text-[var(--text-muted)]">Relics</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{totalFloors}</div>
            <div className="text-xs text-[var(--text-muted)]">Floors</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{run.acts.length}</div>
            <div className="text-xs text-[var(--text-muted)]">Acts</div>
          </div>
        </div>

        {!run.win && run.killed_by_encounter && (
          <div className="mt-3 text-sm text-red-300">
            Killed by{" "}
            <Link href={`${lp}/encounters/${cleanId(run.killed_by_encounter).toLowerCase()}`} className="text-red-200 hover:underline font-medium">
              {displayName(run.killed_by_encounter)}
            </Link>
          </div>
        )}

        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Seed: {run.seed} · {run.game_mode}
        </div>
      </div>

      {/* Final Deck */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Final Deck ({player.deck.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {player.deck
            .sort((a, b) => cleanId(a.id).localeCompare(cleanId(b.id)))
            .map((card, i) => {
              const cid = cleanId(card.id);
              return (
                <CardPill
                  key={`${cid}-${i}`}
                  cardId={cid}
                  upgraded={!!card.current_upgrade_level}
                  enchantment={card.enchantment ? cleanId(card.enchantment.id) : undefined}
                  cardData={cardData}
                  lp={lp}
                  className={`text-xs px-2 py-1 rounded border transition-colors hover:bg-[var(--bg-card-hover)] ${
                    card.current_upgrade_level
                      ? "bg-emerald-950/30 border-emerald-800/30 text-emerald-300"
                      : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                />
              );
            })}
        </div>
      </div>

      {/* Relics */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Relics ({player.relics.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {player.relics.map((relic, i) => {
            const rid = cleanId(relic.id);
            return (
              <RelicPill
                key={`${rid}-${i}`}
                relicId={rid}
                relicData={relicData}
                lp={lp}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-gold)] hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                {displayName(relic.id)}
                <span className="text-[var(--text-muted)] ml-1">F{relic.floor_added_to_deck}</span>
              </RelicPill>
            );
          })}
        </div>
      </div>

      {/* Floor-by-floor */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Floor History
        </h2>
        <div className="space-y-1">
          {run.map_point_history.map((actFloors, actIdx) => (
            <div key={actIdx}>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-3 mb-1.5">
                {displayName(run.acts[actIdx] || `Act ${actIdx + 1}`)}
              </h3>
              {actFloors.map((floor, floorIdx) => {
                const ps = floor.player_stats?.[0];
                const room = floor.rooms?.[0];
                const encounter = room?.model_id ? displayName(room.model_id) : floor.map_point_type;

                const roomTypeColors: Record<string, string> = {
                  monster: "text-gray-300",
                  elite: "text-amber-400",
                  boss: "text-red-400",
                  rest: "text-emerald-400",
                  shop: "text-cyan-400",
                  event: "text-purple-400",
                  treasure: "text-yellow-400",
                };

                const picked = ps?.card_choices?.filter((c) => c.was_picked).map((c) => displayName(c.card.id)) || [];
                const skipped = ps?.card_choices?.filter((c) => !c.was_picked).map((c) => displayName(c.card.id)) || [];

                return (
                  <div key={floorIdx} className="flex items-start gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0 text-xs">
                    <span className="text-[var(--text-muted)] w-6 text-right flex-shrink-0">
                      {floorIdx + 1}
                    </span>
                    <span className={`w-14 flex-shrink-0 font-medium ${roomTypeColors[floor.map_point_type] || "text-[var(--text-secondary)]"}`}>
                      {floor.map_point_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--text-secondary)]">{encounter}</span>
                      {room?.turns_taken != null && (
                        <span className="text-[var(--text-muted)] ml-1">({room.turns_taken}T)</span>
                      )}
                      {picked.length > 0 && (
                        <span className="text-emerald-400 ml-2">+{picked.join(", ")}</span>
                      )}
                      {skipped.length > 0 && (
                        <span className="text-[var(--text-muted)] ml-1 line-through">{skipped.join(", ")}</span>
                      )}
                    </div>
                    {ps && (
                      <div className="flex items-center gap-2 flex-shrink-0 text-[var(--text-muted)]">
                        {ps.damage_taken > 0 && <span className="text-red-400">-{ps.damage_taken}</span>}
                        {ps.hp_healed > 0 && <span className="text-emerald-400">+{ps.hp_healed}</span>}
                        <span>{ps.current_hp}/{ps.max_hp}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

function CommunityStatsPanel({ stats, cardData, relicData }: { stats: CommunityStats; cardData: Record<string, CardInfo>; relicData: Record<string, RelicInfo> }) {
  const lp = useLangPrefix();

  if (stats.total_runs === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 text-center text-[var(--text-muted)]">
        No runs submitted yet. Be the first!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Community Stats</h2>
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

        {/* Character win rates */}
        {stats.characters.length > 0 && (
          <div className="space-y-1.5">
            {stats.characters.map((c) => (
              <div key={c.character} className="flex items-center justify-between text-sm">
                <Link href={`${lp}/characters/${c.character.toLowerCase()}`} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]">
                  {displayName(`CHARACTER.${c.character}`)}
                </Link>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[var(--text-muted)]">{c.total} runs</span>
                  <span className={c.win_rate > 50 ? "text-emerald-400" : "text-[var(--text-secondary)]"}>{c.win_rate}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pick Rates */}
      {stats.pick_rates.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Highest Pick Rates</h2>
          <div className="space-y-1">
            {stats.pick_rates.slice(0, 10).map((c) => (
              <div key={c.card_id} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                <CardPill cardId={c.card_id} cardData={cardData} lp={lp} className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)]" />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--text-muted)]">{c.picked}/{c.offered}</span>
                  <span className="text-emerald-400 font-medium">{c.pick_rate}%</span>
                </div>
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
                {displayName(`RELIC.${r.relic_id}`)} <span className="text-[var(--text-muted)]">({r.count})</span>
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
    </div>
  );
}

export default function RunsClient() {
  const [jsonInput, setJsonInput] = useState("");
  const [run, setRun] = useState<RunData | null>(null);
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "submitted" | "duplicate" | "error">("idle");
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [tab, setTab] = useState<"paste" | "stats">("paste");
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});

  // Load card/relic data for tooltips
  useEffect(() => {
    cachedFetch<CardInfo[]>(`${API}/api/cards`).then((cards) => {
      const map: Record<string, CardInfo> = {};
      for (const c of cards) map[c.id] = c;
      setCardData(map);
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics`).then((relics) => {
      const map: Record<string, RelicInfo> = {};
      for (const r of relics) map[r.id] = r;
      setRelicData(map);
    });
  }, []);

  // Load community stats
  useEffect(() => {
    fetch(`${API}/api/runs/stats`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, [submitStatus]);

  function parseRun() {
    setError("");
    setRun(null);
    setSubmitStatus("idle");
    try {
      const data = JSON.parse(jsonInput);
      if (!data.players || !data.map_point_history || !Array.isArray(data.acts)) {
        setError("This doesn't look like a valid run file. Expected players, map_point_history, and acts fields.");
        return;
      }
      setRun(data);
    } catch {
      setError("Invalid JSON. Make sure you pasted the full contents of the .run file.");
    }
  }

  async function submitToCommunity() {
    if (!run) return;
    setSubmitStatus("submitting");
    try {
      const res = await fetch(`${API}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonInput,
      });
      if (res.status === 409) {
        setSubmitStatus("duplicate");
      } else if (res.ok) {
        setSubmitStatus("submitted");
      } else {
        setSubmitStatus("error");
      }
    } catch {
      setSubmitStatus("error");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Run Viewer
      </h1>
      <p className="text-[var(--text-secondary)] mb-4">
        Paste your run history JSON to see a detailed breakdown, or view community stats from submitted runs.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setTab("paste")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "paste" ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Analyze Run
        </button>
        <button
          onClick={() => setTab("stats")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "stats" ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Community Stats
          {stats && stats.total_runs > 0 && (
            <span className="ml-1.5 text-xs text-[var(--text-muted)]">({stats.total_runs})</span>
          )}
        </button>
      </div>

      {tab === "paste" && (
        <>
          {!run ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Run files are located at <code className="bg-[var(--bg-primary)] px-1 py-0.5 rounded">%appdata%/Roaming/SlayTheSpire2/steam/&lt;steamid&gt;/profile#/saves/</code> — open the <code>.run</code> file in a text editor and paste the contents below.
              </p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"acts":["ACT.OVERGROWTH"...],"ascension":0,...}'
                rows={10}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent-gold)] resize-none"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                onClick={parseRun}
                disabled={!jsonInput.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Analyze Run
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => { setRun(null); setJsonInput(""); setSubmitStatus("idle"); }}
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  &larr; Analyze another run
                </button>
                <div className="ml-auto">
                  {submitStatus === "idle" && (
                    <button
                      onClick={submitToCommunity}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-800/30 hover:bg-emerald-900/60 transition-colors"
                    >
                      Submit to Community Stats
                    </button>
                  )}
                  {submitStatus === "submitting" && (
                    <span className="text-xs text-[var(--text-muted)]">Submitting...</span>
                  )}
                  {submitStatus === "submitted" && (
                    <span className="text-xs text-emerald-400">Submitted! Thanks for contributing.</span>
                  )}
                  {submitStatus === "duplicate" && (
                    <span className="text-xs text-amber-400">This run was already submitted.</span>
                  )}
                  {submitStatus === "error" && (
                    <span className="text-xs text-red-400">Failed to submit. Try again later.</span>
                  )}
                </div>
              </div>
              <RunOverview run={run} cardData={cardData} relicData={relicData} />
            </div>
          )}
        </>
      )}

      {tab === "stats" && stats && <CommunityStatsPanel stats={stats} cardData={cardData} relicData={relicData} />}
      {tab === "stats" && !stats && (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      )}
    </div>
  );
}
