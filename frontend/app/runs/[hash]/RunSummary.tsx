"use client";

/**
 * In-game-style summary of a run, mimicking the victory/defeat screen.
 * Renders three act rows of map node icons + relic strip + card grid.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CardPill,
  RelicPill,
  cleanId,
  displayName,
  type CardInfo,
  type RelicInfo,
} from "./RunPills";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ICON_BASE = `${API}/static/images/ui/run_history`;

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
  damage_taken?: number;
  hp_healed?: number;
  gold_gained?: number;
  gold_spent?: number;
  card_choices?: Array<{ card: { id: string }; was_picked: boolean }>;
  cards_gained?: Array<{ id: string }>;
  cards_removed?: Array<{ id: string }>;
  upgraded_cards?: string[];
  rest_site_choices?: string[];
  potion_used?: string[];
  relic_choices?: Array<{ choice: string; was_picked: boolean }>;
  event_choices?: Array<{ title?: { key?: string } }>;
}

interface Room {
  model_id?: string;
  room_type?: string;
  monster_ids?: string[];
  turns_taken?: number;
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

const TYPE_ICON: Record<string, string> = {
  Attack: "type_sort_attack.png",
  Skill: "type_sort_skill.png",
  Power: "type_sort_power.png",
  // Curse / Status / Quest / Token all use the "other" glyph
};

function typeIconUrl(type: string | undefined): string {
  const file = (type && TYPE_ICON[type]) || "type_sort_other.png";
  return `${API}/static/images/ui/compendium/card/${file}`;
}


function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(epoch?: number): string {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

  if (mp.map_point_type === "boss" && modelId.endsWith("_BOSS")) {
    const slug = cleanId(modelId).toLowerCase();
    return { src: `${ICON_BASE}/${slug}.webp`, tier, label: displayName(modelId) };
  }
  if (mp.map_point_type === "ancient" && modelId.startsWith("EVENT.")) {
    const slug = cleanId(modelId).toLowerCase();
    return { src: `${ICON_BASE}/${slug}.webp`, tier: "", label: displayName(modelId) };
  }
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

  const deathQuote = run.win
    ? `${displayName(player.character)} ascended.`
    : run.was_abandoned
      ? "The journey ended."
      : run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE"
        ? `${displayName(player.character)} fell to ${displayName(run.killed_by_encounter)}.`
        : `${displayName(player.character)} fell.`;

  const relicsByRarity = bucketByRarity(player.relics, (r) => relicData[cleanId(r.id)]?.rarity);
  const cardsByRarity = bucketByRarity(player.deck, (c) => cardData[cleanId(c.id)]?.rarity);

  const stackedCards = stackCards(player.deck, cardData);

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 mb-4"
      style={{
        borderColor: `color-mix(in srgb, ${charColor} 35%, transparent)`,
        background: `color-mix(in srgb, ${charColor} 6%, var(--bg-card))`,
      }}
    >
      {/* Top stats bar — game iconography */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm mb-3 pb-3 border-b border-[var(--border-subtle)]">
        <Link href={`${lp}/characters/${charSlug}`} className="flex-shrink-0">
          <img
            src={charIcon}
            alt={displayName(player.character)}
            className="w-9 h-9 rounded-full object-cover border-2"
            style={{ borderColor: charColor }}
            crossOrigin="anonymous"
          />
        </Link>
        <IconStat icon={`${API}/static/images/ui/top_bar/top_bar_heart.webp`} alt="HP" value={`${finalStats?.current_hp ?? "?"}/${finalStats?.max_hp ?? "?"}`} color="var(--color-ironclad)" />
        <IconStat icon={`${API}/static/images/ui/top_bar/top_bar_gold.webp`} alt="Gold" value={finalStats?.current_gold ?? "?"} color="var(--accent-gold)" />
        <PotionSlots filled={filledPotions} total={potionSlots} />
        <IconStat icon={`${API}/static/images/ui/top_bar/top_bar_map.webp`} alt="Floor" value={totalFloors} />
        <IconStat icon={`${API}/static/images/ui/top_bar/timer_icon.webp`} alt="Time" value={formatTime(run.run_time ?? 0)} />
        {(run.ascension ?? 0) > 0 && (
          <IconStat icon={`${API}/static/images/ui/top_bar/top_bar_ascension.webp`} alt="Ascension" value={`A${run.ascension}`} color="var(--accent-gold)" />
        )}
        <div className="ml-auto text-right text-xs text-[var(--text-muted)] leading-tight">
          {run.start_time && <div>{formatDate(run.start_time)}</div>}
          {run.seed && (
            <div>
              Seed: <span className="font-mono">{run.seed}</span>
            </div>
          )}
          <div>
            {run.game_mode ?? "Standard"}
            {run.build_id && <span className="ml-1">· {run.build_id}</span>}
          </div>
        </div>
      </div>

      <div className="mb-4 italic text-sm text-[var(--text-secondary)]">&ldquo;{deathQuote}&rdquo;</div>

      {/* Act rows with hover popovers */}
      <div className="space-y-2 mb-5">
        {(run.map_point_history ?? []).map((act, i) => {
          const actName = run.acts?.[i] ? displayName(run.acts[i]) : `Act ${i + 1}`;
          const actStartFloor = (run.map_point_history ?? []).slice(0, i).reduce((sum, a) => sum + a.length, 0) + 1;
          return (
            <div key={i} className="flex items-center gap-2 sm:gap-3">
              <div className="w-20 sm:w-24 text-xs font-medium text-[var(--text-secondary)] flex-shrink-0">{actName}</div>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {act.map((mp, j) => (
                  <MapNode key={j} mp={mp} floorNum={actStartFloor + j} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Relics row — uses RelicPill tooltip */}
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
              <RelicPill
                key={`${rid}-${i}`}
                relicId={rid}
                relicData={relicData}
                lp={lp}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-black/30 flex items-center justify-center hover:bg-black/50 transition-colors"
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
              </RelicPill>
            );
          })}
        </div>
      </div>

      {/* Cards grid — card art thumbnails + CardPill tooltip */}
      <div>
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          <span className="font-semibold">Cards ({player.deck.length}):</span>{" "}
          <RaritySummary buckets={cardsByRarity} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
          {stackedCards.map((entry, i) => {
            const info = cardData[entry.id];
            const colorClass = info ? RARITY_TEXT_COLOR[info.rarity] ?? "text-zinc-300" : "text-zinc-300";
            return (
              <CardPill
                key={`${entry.id}-${entry.upgraded ? "u" : "n"}-${i}`}
                cardId={entry.id}
                upgraded={entry.upgraded}
                cardData={cardData}
                lp={lp}
                className="flex items-center gap-1.5 text-xs hover:bg-[var(--bg-card-hover)] rounded px-1 py-0.5 transition-colors"
              >
                <img
                  src={typeIconUrl(info?.type)}
                  alt={info?.type ?? ""}
                  className="w-5 h-5 flex-shrink-0 object-contain"
                  crossOrigin="anonymous"
                />
                <span className={`truncate ${colorClass}`}>
                  {entry.count > 1 && <span className="text-[var(--text-muted)] mr-1">{entry.count}x</span>}
                  {info?.name || displayName(`CARD.${entry.id}`)}
                  {entry.upgraded && "+"}
                </span>
              </CardPill>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MapNode({
  mp,
  floorNum,
}: {
  mp: MapPoint;
  floorNum: number;
}) {
  const [show, setShow] = useState(false);
  const { src, tier, label } = iconFor(mp);
  const room = mp.rooms?.[0];
  const ps = mp.player_stats?.[0];

  return (
    <span
      className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-black/30 flex items-center justify-center group ${TIER_OUTLINE[tier] ?? ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
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
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">{label}</div>
            <div className="text-[10px] text-[var(--text-muted)]">Floor {floorNum}</div>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mb-1.5 capitalize">
            {mp.map_point_type.replace(/_/g, " ")}
            {tier && ` · ${tier}`}
            {room?.turns_taken != null && ` · ${room.turns_taken} turns`}
          </div>
          {room?.monster_ids && room.monster_ids.length > 0 && (
            <div className="text-[10px] text-[var(--text-secondary)] mb-1.5">
              vs {room.monster_ids.map((m) => displayName(m)).join(", ")}
            </div>
          )}
          {ps && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--text-muted)] mb-1.5">
              <span>HP {ps.current_hp}/{ps.max_hp}</span>
              {(ps.damage_taken ?? 0) > 0 && (
                <span style={{ color: "var(--color-ironclad)" }}>-{ps.damage_taken}</span>
              )}
              {(ps.hp_healed ?? 0) > 0 && (
                <span style={{ color: "var(--color-silent)" }}>+{ps.hp_healed} HP</span>
              )}
              {(ps.gold_gained ?? 0) > 0 && (
                <span style={{ color: "var(--accent-gold)" }}>+{ps.gold_gained}g</span>
              )}
              {(ps.gold_spent ?? 0) > 0 && (
                <span style={{ color: "var(--text-muted)" }}>-{ps.gold_spent}g</span>
              )}
            </div>
          )}
          {ps?.cards_gained && ps.cards_gained.length > 0 && (
            <div className="text-[10px] text-[var(--color-silent)] mb-0.5">
              + {ps.cards_gained.map((c) => displayName(c.id)).join(", ")}
            </div>
          )}
          {ps?.cards_removed && ps.cards_removed.length > 0 && (
            <div className="text-[10px] text-[var(--color-ironclad)] mb-0.5">
              − {ps.cards_removed.map((c) => displayName(c.id)).join(", ")}
            </div>
          )}
          {ps?.upgraded_cards && ps.upgraded_cards.length > 0 && (
            <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
              ⬆ {ps.upgraded_cards.map((c) => displayName(c)).join(", ")}
            </div>
          )}
          {ps?.relic_choices?.some((r) => r.was_picked) && (
            <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
              + {ps.relic_choices.filter((r) => r.was_picked).map((r) => displayName(r.choice)).join(", ")}
            </div>
          )}
          {ps?.event_choices?.[0]?.title?.key && (
            <div className="text-[10px] text-[var(--text-secondary)] mt-1 italic">
              chose {humanizeChoiceKey(ps.event_choices[0].title.key)}
            </div>
          )}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </span>
  );
}

function humanizeChoiceKey(key: string): string {
  // e.g. "MORPHIC_GROVE.pages.INITIAL.options.LONER.title" → "Loner"
  const parts = key.split(".");
  const idx = parts.findIndex((p) => p === "options");
  if (idx >= 0 && parts[idx + 1]) {
    return parts[idx + 1].replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return key;
}

function IconStat({ icon, alt, value, color }: { icon: string; alt: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
      <img src={icon} alt={alt} className="w-5 h-5 object-contain" crossOrigin="anonymous" />
      <span className="font-semibold" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

function PotionSlots({ filled, total }: { filled: number; total: number }) {
  const POTION_ICON = `${API}/static/images/ui/icons/potion_icon.webp`;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) =>
        i < filled ? (
          <img
            key={i}
            src={POTION_ICON}
            alt="Potion"
            className="w-5 h-5 object-contain"
            crossOrigin="anonymous"
          />
        ) : (
          <span
            key={i}
            className="w-4 h-5 rounded-sm border border-dashed border-[var(--border-subtle)]"
          />
        ),
      )}
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
  const rarityScore: Record<string, number> = { Rare: 5, Uncommon: 4, Common: 3, Starter: 1, Curse: 0, Status: 0 };
  return [...map.values()].sort((a, b) => {
    const ra = rarityScore[cardData[a.id]?.rarity ?? ""] ?? 2;
    const rb = rarityScore[cardData[b.id]?.rarity ?? ""] ?? 2;
    if (ra !== rb) return rb - ra;
    return (cardData[a.id]?.name ?? a.id).localeCompare(cardData[b.id]?.name ?? b.id);
  });
}

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
