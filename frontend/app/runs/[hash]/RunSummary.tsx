"use client";

/**
 * In-game-style summary of a run, mimicking the victory/defeat screen.
 * Renders three act rows of map node icons + relic strip + card grid.
 */

import Link from "next/link";
import type { ReactNode } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ICON_BASE = `${API}/static/images/ui/run_history`;

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

interface DeckCard {
  id: string;
  current_upgrade_level?: number;
  enchantment?: { id: string; amount: number } | null;
}

interface RunRelic {
  id: string;
  floor_added_to_deck?: number;
}

interface PlayerStats {
  current_hp?: number;
  max_hp?: number;
  current_gold?: number;
}

interface Room {
  model_id?: string;
  room_type?: string;
  monster_ids?: string[];
}

interface MapPoint {
  map_point_type: string;
  rooms?: Room[];
  player_stats?: PlayerStats[];
}

interface Player {
  character: string;
  deck: DeckCard[];
  relics: RunRelic[];
  potions?: { id: string; slot_index: number }[];
  max_potion_slot_count?: number;
}

interface Run {
  win: boolean;
  was_abandoned: boolean;
  ascension?: number;
  run_time?: number;
  seed?: string;
  build_id?: string;
  game_mode?: string;
  acts?: string[];
  start_time?: number;
  killed_by_encounter?: string;
  modifiers?: string[];
  map_point_history?: MapPoint[][];
  players: Player[];
}

const RARITY_ORDER = ["Starter", "Common", "Uncommon", "Rare", "Ancient", "Event", "Token", "Status", "Curse", "Quest"];

const RARITY_TEXT_COLOR: Record<string, string> = {
  Starter: "text-zinc-400",
  Common: "text-zinc-300",
  Uncommon: "text-blue-400",
  Rare: "text-amber-400",
  Ancient: "text-fuchsia-400",
  Event: "text-purple-400",
  Token: "text-emerald-400",
  Status: "text-rose-400",
  Curse: "text-rose-500",
  Quest: "text-amber-300",
};

const TIER_OUTLINE: Record<string, string> = {
  weak: "ring-1 ring-emerald-500/40",
  normal: "ring-1 ring-amber-500/40",
  elite: "ring-1 ring-orange-500/60",
  boss: "ring-2 ring-rose-500/60",
};

function cleanId(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION|EVENT)\./, "");
}

function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(epoch?: number): string {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  return d.toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Decide the tier ("weak"|"normal"|"elite"|"boss") for an encounter. */
function encounterTier(modelId: string | undefined, mapPointType: string): "weak" | "normal" | "elite" | "boss" | "" {
  if (!modelId) return "";
  if (modelId.endsWith("_BOSS")) return "boss";
  if (modelId.endsWith("_ELITE") || mapPointType === "elite") return "elite";
  if (modelId.endsWith("_WEAK")) return "weak";
  if (modelId.endsWith("_NORMAL")) return "normal";
  return mapPointType === "monster" ? "normal" : "";
}

/** Resolve the icon filename for a map point. */
function iconFor(mp: MapPoint): { src: string; tier: string; label: string } {
  const room = mp.rooms?.[0];
  const modelId = room?.model_id || "";
  const tier = encounterTier(modelId, mp.map_point_type);

  // Boss: use specific boss icon
  if (mp.map_point_type === "boss" && modelId.endsWith("_BOSS")) {
    const slug = cleanId(modelId).toLowerCase();
    return { src: `${ICON_BASE}/${slug}.webp`, tier, label: displayName(modelId) };
  }

  // Ancient: use specific ancient icon
  if (mp.map_point_type === "ancient" && modelId.startsWith("EVENT.")) {
    const slug = cleanId(modelId).toLowerCase();
    return { src: `${ICON_BASE}/${slug}.webp`, tier: "", label: displayName(modelId) };
  }

  // Generic types
  const typeMap: Record<string, string> = {
    monster: "monster",
    elite: "elite",
    event: "event",
    treasure: "treasure",
    rest_site: "rest_site",
    shop: "shop",
    unknown: "event",
  };
  const slug = typeMap[mp.map_point_type] ?? "monster";
  const label = modelId ? displayName(modelId) : displayName(mp.map_point_type);
  return { src: `${ICON_BASE}/${slug}.webp`, tier, label };
}

interface Props {
  run: Run;
  player: Player;
  cardData: Record<string, CardInfo>;
  relicData: Record<string, RelicInfo>;
  charColor: string;
  langPrefix: string;
}

export default function RunSummary({ run, player, cardData, relicData, charColor, langPrefix: lp }: Props) {
  const finalStats = lastPlayerStats(run);
  const totalFloors = (run.map_point_history ?? []).reduce((sum, act) => sum + act.length, 0);
  const charSlug = cleanId(player.character).toLowerCase();
  const charIcon = `${API}/static/images/characters/character_icon_${charSlug}.webp`;
  const potionSlots = player.max_potion_slot_count ?? 3;
  const filledPotions = (player.potions ?? []).length;

  // Death quote — generic for now; could pull from localization later
  const deathQuote = run.win
    ? `${displayName(player.character)} ascended.`
    : run.was_abandoned
      ? "The journey ended."
      : run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE"
        ? `${displayName(player.character)} fell to ${displayName(run.killed_by_encounter)}.`
        : `${displayName(player.character)} fell.`;

  // Bucket relics by rarity for the count summary
  const relicsByRarity = bucketByRarity(player.relics, (r) => relicData[cleanId(r.id)]?.rarity);
  const cardsByRarity = bucketByRarity(player.deck, (c) => cardData[cleanId(c.id)]?.rarity);

  // Group cards by name+upgrade for "2x" stacking
  const stackedCards = stackCards(player.deck, cardData);

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 mb-4"
      style={{
        borderColor: `color-mix(in srgb, ${charColor} 35%, transparent)`,
        background: `color-mix(in srgb, ${charColor} 6%, var(--bg-card))`,
      }}
    >
      {/* Top stats bar */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-sm mb-3 pb-3 border-b border-[var(--border-subtle)]">
        <Link href={`${lp}/characters/${charSlug}`} className="flex-shrink-0">
          <img
            src={charIcon}
            alt={displayName(player.character)}
            className="w-8 h-8 rounded-full object-cover ring-2"
            style={{ ["--tw-ring-color" as string]: charColor } as React.CSSProperties}
            crossOrigin="anonymous"
          />
        </Link>
        <Stat icon="❤️" value={`${finalStats?.current_hp ?? "?"}/${finalStats?.max_hp ?? "?"}`} color="var(--color-ironclad)" />
        <Stat icon="🪙" value={`${finalStats?.current_gold ?? "?"}`} color="var(--accent-gold)" />
        <PotionSlots filled={filledPotions} total={potionSlots} />
        <Stat icon="🗺" value={`${totalFloors}`} />
        <Stat icon="⏱" value={formatTime(run.run_time ?? 0)} />
        <div className="ml-auto text-right text-xs text-[var(--text-muted)] leading-tight">
          {run.start_time && <div>{formatDate(run.start_time)}</div>}
          {run.seed && <div>Seed: <span className="font-mono">{run.seed}</span></div>}
          <div>
            {(player.character ? "Singleplayer" : "Multiplayer")} · {run.game_mode ?? "Standard"}
            {run.build_id && <span className="ml-1">· {run.build_id}</span>}
          </div>
        </div>
      </div>

      {/* Death/victory quote */}
      <div className="mb-4 italic text-sm text-[var(--text-secondary)]">&ldquo;{deathQuote}&rdquo;</div>

      {/* Act rows */}
      <div className="space-y-2 mb-5">
        {(run.map_point_history ?? []).map((act, i) => {
          const actName = run.acts?.[i] ? displayName(run.acts[i]) : `Act ${i + 1}`;
          return (
            <div key={i} className="flex items-center gap-2 sm:gap-3">
              <div className="w-20 sm:w-24 text-xs font-medium text-[var(--text-secondary)] flex-shrink-0">{actName}</div>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {act.map((mp, j) => {
                  const { src, tier, label } = iconFor(mp);
                  return (
                    <span
                      key={j}
                      className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-black/30 flex items-center justify-center group ${TIER_OUTLINE[tier] ?? ""}`}
                      title={label}
                    >
                      <img
                        src={src}
                        alt={label}
                        className="w-full h-full object-contain p-0.5"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Relics row */}
      <div className="mb-4">
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          <span className="font-semibold">Relics ({player.relics.length}):</span>{" "}
          <RaritySummary buckets={relicsByRarity} />
        </div>
        <div className="flex flex-wrap gap-1">
          {player.relics.map((relic, i) => {
            const rid = cleanId(relic.id);
            const info = relicData[rid];
            return (
              <Link
                key={`${rid}-${i}`}
                href={`${lp}/relics/${rid.toLowerCase()}`}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-black/30 flex items-center justify-center hover:bg-black/50 transition-colors"
                title={info?.name || displayName(relic.id)}
              >
                {info?.image_url ? (
                  <img
                    src={`${API}${info.image_url}`}
                    alt={info.name}
                    className="w-full h-full object-contain p-0.5"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span className="text-[8px] text-[var(--text-muted)]">{rid.slice(0, 3)}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Cards grid */}
      <div>
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          <span className="font-semibold">Cards ({player.deck.length}):</span>{" "}
          <RaritySummary buckets={cardsByRarity} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
          {stackedCards.map((entry, i) => {
            const info = cardData[entry.id];
            const colorClass = info ? RARITY_TEXT_COLOR[info.rarity] ?? "text-zinc-300" : "text-zinc-300";
            return (
              <Link
                key={`${entry.id}-${entry.upgraded ? "u" : "n"}-${i}`}
                href={`${lp}/cards/${entry.id.toLowerCase()}`}
                className="flex items-center gap-2 text-xs hover:bg-[var(--bg-card-hover)] rounded px-1 py-0.5 transition-colors"
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/40 text-[10px] font-bold text-[var(--accent-gold)] flex-shrink-0">
                  {info?.cost ?? "?"}
                </span>
                <span className={`truncate ${colorClass}`}>
                  {entry.count > 1 && <span className="text-[var(--text-muted)] mr-1">{entry.count}x</span>}
                  {info?.name || displayName(`CARD.${entry.id}`)}
                  {entry.upgraded && "+"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, color }: { icon: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
      <span className="text-base" aria-hidden>{icon}</span>
      <span className="font-semibold" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function PotionSlots({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`w-3.5 h-5 rounded-sm border ${
            i < filled
              ? "bg-emerald-400/40 border-emerald-400/60"
              : "bg-black/30 border-[var(--border-subtle)]"
          }`}
        />
      ))}
    </div>
  );
}

function RaritySummary({ buckets }: { buckets: Map<string, number> }) {
  const parts: string[] = [];
  for (const r of RARITY_ORDER) {
    const n = buckets.get(r);
    if (n) parts.push(`${n} ${r}`);
  }
  return <span className="text-[var(--text-muted)]">{parts.join(", ")}</span>;
}

function bucketByRarity<T>(items: T[], getRarity: (item: T) => string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    const r = getRarity(item) ?? "Unknown";
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return m;
}

interface StackEntry {
  id: string;
  upgraded: boolean;
  count: number;
}

function stackCards(deck: DeckCard[], cardData: Record<string, CardInfo>): StackEntry[] {
  const map = new Map<string, StackEntry>();
  for (const card of deck) {
    const id = cleanId(card.id);
    const upgraded = !!card.current_upgrade_level;
    const key = `${id}::${upgraded}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { id, upgraded, count: 1 });
    }
  }
  // Sort: rarity tier (rare→common→starter), then alpha
  const rarityScore: Record<string, number> = { Rare: 5, Uncommon: 4, Common: 3, Starter: 1, Curse: 0, Status: 0 };
  return [...map.values()].sort((a, b) => {
    const ra = rarityScore[cardData[a.id]?.rarity ?? ""] ?? 2;
    const rb = rarityScore[cardData[b.id]?.rarity ?? ""] ?? 2;
    if (ra !== rb) return rb - ra;
    return (cardData[a.id]?.name ?? a.id).localeCompare(cardData[b.id]?.name ?? b.id);
  });
}

/** Find the player_stats from the latest map point that has them. */
function lastPlayerStats(run: Run): PlayerStats | undefined {
  const acts = run.map_point_history ?? [];
  for (let a = acts.length - 1; a >= 0; a--) {
    for (let f = acts[a].length - 1; f >= 0; f--) {
      const ps = acts[a][f]?.player_stats?.[0];
      if (ps) return ps;
    }
  }
  return undefined;
}
