"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { hreflangOf } from "@/lib/locale";
/**
 * In-game-style summary of a run, mimicking the victory/defeat screen.
 * Renders three act rows of map node icons + relic strip + card grid.
 */

import { useEffect, useState, type ReactNode } from "react";
import type { TFn } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import TinyCard from "@/app/components/TinyCard";
import {
  CardPill,
  RelicPill,
  PotionPill,
  displayName,
  type CardInfo,
  type RelicInfo,
  type PotionInfo,
} from "./RunPills";
import {
  eventChoiceName,
  restChoiceName,
  roomTitle,
  roomTypeTitle,
  typedRoom,
} from "./run-names";
import { useTryGameTranslations, type TryGameT } from "@/lib/game-i18n";
import type {
  EncounterRoom,
  Floor,
  Player,
  PlayerStats,
  Run,
} from "@/lib/api/run/types";

export type { PotionInfo };

import { imageUrl } from "@/lib/image-url";
import { stackCards } from "@/lib/deck-stack";
import { fmtDateTime, fmtDateTimePacific } from "@/lib/pacific";
import { PlayerBadge } from "@/app/components/SupporterBadge";
import { OwnerTheme } from "@/app/components/OwnerTheme";
const ICON_BASE = imageUrl("/static/images/ui/run_history");

const RARITY_ORDER = [
  "Starter",
  "Common",
  "Uncommon",
  "Rare",
  "Ancient",
  "Event",
  "Token",
  "Status",
  "Curse",
  "Quest",
];

// Matches NDeckHistoryEntry.Reload() in the game:
//   enchanted → StsColors.purple
//   upgraded  → StsColors.green
//   else      → default label color
function cardLabelColor(upgraded: boolean, enchanted: boolean): string {
  if (enchanted) return "text-[var(--color-necrobinder)]";
  if (upgraded) return "text-[var(--color-silent)]";
  return "text-[var(--text-primary)]";
}

const TIER_LABELS: Record<string, string> = {
  weak: "Weak",
  normal: "Normal",
  elite: "Elite",
  boss: "Boss",
};

const TIER_OUTLINE: Record<string, string> = {
  weak: "ring-1 ring-success/40",
  normal: "ring-1 ring-warning/40",
  elite: "ring-1 ring-warning/60",
  boss: "ring-2 ring-danger/60",
};

const ICON_SLUG: Record<string, string> = {
  monster: "monster",
  elite: "elite",
  event: "event",
  treasure: "treasure",
  rest_site: "rest_site",
  shop: "shop",
  unknown: "event",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const DATE_STYLE = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

// Server-rendered pages must emit the same string everywhere, so the first
// paint is Pacific; after hydration it becomes the viewer's local time.
function modeLabel(mode: string | undefined): string {
  if (!mode) return "Standard";
  return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
}

function formatDate(
  epoch: number | undefined,
  local: boolean,
  locale: string,
): string {
  if (!epoch) return "";
  return local
    ? fmtDateTime(epoch * 1000, DATE_STYLE, locale)
    : fmtDateTimePacific(epoch * 1000, DATE_STYLE, locale);
}

/** Decide the tier ("weak"|"normal"|"elite"|"boss") for an encounter. */
function encounterTier(
  room: EncounterRoom,
): "weak" | "normal" | "elite" | "boss" {
  switch (room.encounter_type) {
    case "BOSS":
      return "boss";
    case "ELITE":
      return "elite";
    default:
      return room.id.endsWith("_WEAK") ? "weak" : "normal";
  }
}

/** The detail page for what the floor held, when it has one. */
function floorHref(floor: Floor, bp: string): string | null {
  const room = typedRoom(floor);
  if (room?.type === "ENCOUNTER")
    return `${bp}/encounters/${room.id.toLowerCase()}`;
  if (room?.type === "EVENT") return `${bp}/events/${room.id.toLowerCase()}`;
  return null;
}

/** Resolve the icon filename, tier and label for a floor. */
function iconFor(
  floor: Floor,
  gt: TryGameT,
  buildId?: string,
): { src: string; betaSrc?: string; tier: string; label: string } {
  const room = typedRoom(floor);
  const tier = room?.type === "ENCOUNTER" ? encounterTier(room) : "";

  // Main run_history path plus a beta-versioned fallback. Beta-only content
  // (e.g. the AEONGLASS boss) only has its map icon under the beta tree, so a
  // beta build's run must fall back to /beta/<build_id>/... when the main path
  // 404s. Known main icons never 404, so the fallback only fires when needed.
  const resolve = (slug: string) => ({
    src: `${ICON_BASE}/${slug}.webp`,
    betaSrc: buildId
      ? imageUrl(`/static/images/beta/${buildId}/ui/run_history/${slug}.webp`)
      : undefined,
  });

  const label = roomTitle(floor, gt) ?? roomTypeTitle(floor, gt);
  if (room?.type === "ENCOUNTER" && room.encounter_type === "BOSS") {
    return { ...resolve(room.id.toLowerCase()), tier, label };
  }
  if (floor.floor_type === "ANCIENT" && room?.type === "EVENT") {
    return { ...resolve(room.id.toLowerCase()), tier: "", label };
  }
  const slug = ICON_SLUG[floor.raw_type] ?? "monster";
  return { ...resolve(slug), tier, label };
}

interface Props {
  run: Run;
  player: Player;
  cardData: Record<string, CardInfo>;
  relicData: Record<string, RelicInfo>;
  potionData: Record<string, PotionInfo>;
  charColor: string;
  langPrefix: string;
  charName: string;
  killedByName?: string;
}

export default function RunSummary({
  run,
  player,
  cardData,
  relicData,
  potionData,
  charColor,
  langPrefix: bp,
  charName,
  killedByName,
}: Props) {
  const t = useT();
  const gt = useTryGameTranslations();
  const dateLocale = hreflangOf(useGameLocale());
  const cardTitle = (id: string) =>
    gt(`cards.${id}.title`) ?? cardData[id]?.name ?? displayName(`CARD.${id}`);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const finalStats = lastPlayerStats(run);
  const totalFloors = run.floor_history.reduce(
    (sum, act) => sum + act.length,
    0,
  );
  const charSlug = player.character.toLowerCase();
  const charIcon = imageUrl(
    `/static/images/characters/character_icon_${charSlug}.webp`,
  );
  const potionSlots = player.max_potion_slot_count ?? 3;
  const playerPotions = player.potions ?? [];

  const deathQuote = run.win
    ? t("{char} ascended.", { char: charName })
    : run.was_abandoned
      ? t("The journey ended.")
      : killedByName
        ? t("{char} fell to {encounter}.", {
            char: charName,
            encounter: killedByName,
          })
        : t("{char} fell.", { char: charName });

  const relicsByRarity = bucketByRarity(
    player.relics,
    (r) => relicData[r.id]?.rarity,
  );
  const cardsByRarity = bucketByRarity(
    player.deck,
    (c) => cardData[c.id]?.rarity,
  );

  const stackedCards = stackCards(player.deck, cardData, (id) =>
    gt(`cards.${id}.title`),
  );

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 mb-4"
      style={{
        borderColor: `color-mix(in srgb, ${charColor} 35%, transparent)`,
        background: `color-mix(in srgb, ${charColor} 6%, var(--bg-card))`,
      }}
    >
      {/* Top stats bar, game iconography */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm mb-3 pb-3 border-b border-[var(--border-subtle)]">
        <Link href={`${bp}/characters/${charSlug}`} className="flex-shrink-0">
          <img
            src={charIcon}
            alt={charName}
            className="w-9 h-9 rounded-full object-cover border-2"
            style={{ borderColor: charColor }}
            crossOrigin="anonymous"
          />
        </Link>
        <IconStat
          icon={imageUrl("/static/images/ui/top_bar/top_bar_heart.webp")}
          alt={t("HP")}
          value={`${finalStats?.current_hp ?? "?"}/${finalStats?.max_hp ?? "?"}`}
          color="var(--color-ironclad)"
        />
        <IconStat
          icon={imageUrl("/static/images/ui/top_bar/top_bar_gold.webp")}
          alt={t("Gold")}
          value={finalStats?.current_gold ?? "?"}
          color="var(--accent-gold)"
        />
        <PotionSlots
          potions={playerPotions}
          total={potionSlots}
          potionData={potionData}
          bp={bp}
        />
        <IconStat
          icon={imageUrl("/static/images/ui/top_bar/top_bar_map.webp")}
          alt={t("Floor")}
          value={totalFloors}
        />
        <IconStat
          icon={imageUrl("/static/images/ui/top_bar/timer_icon.webp")}
          alt={t("Time")}
          value={formatTime(run.run_time ?? 0)}
        />
        {(run.ascension ?? 0) > 0 && (
          <IconStat
            icon={imageUrl("/static/images/ui/top_bar/top_bar_ascension.webp")}
            alt={t("Ascension")}
            value={`A${run.ascension}`}
            color="var(--accent-gold)"
          />
        )}
        <div className="w-full sm:w-auto sm:ml-auto text-left sm:text-right text-xs text-[var(--text-muted)] leading-tight">
          <OwnerTheme username={run.username} />
          {run.username && (
            <div className="truncate">
              <Link
                href={`${bp}/runs?username=${encodeURIComponent(run.username)}`}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:underline"
                title={t("View all runs by this player")}
              >
                {t("by")}{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {run.username}
                </span>
              </Link>
              <PlayerBadge username={run.username} className="ml-1" />
            </div>
          )}
          {run.start_time && (
            <div className="truncate" suppressHydrationWarning>
              {formatDate(run.start_time, mounted, dateLocale)}
            </div>
          )}
          {run.seed && (
            <div className="truncate">
              {t("Seed")}: <span className="font-mono">{run.seed}</span>
            </div>
          )}
          <div className="truncate">
            {t(modeLabel(run.game_mode))}
            {run.build_id && <span className="ml-1">· {run.build_id}</span>}
          </div>
        </div>
      </div>

      <div className="mb-4 italic text-sm text-[var(--text-secondary)]">
        &ldquo;{deathQuote}&rdquo;
      </div>

      {/* Act rows with hover popovers */}
      <div className="space-y-2 mb-5">
        {run.floor_history.map((act, i) => {
          const actId = run.acts[i];
          const actName =
            (actId ? gt(`acts.${actId}.title`) : undefined) ??
            t("Act {n}", { n: i + 1 });
          const actStartFloor =
            run.floor_history
              .slice(0, i)
              .reduce((sum, a) => sum + a.length, 0) + 1;
          return (
            <div key={i} className="flex items-center gap-2 sm:gap-3">
              <div className="w-20 sm:w-24 text-xs font-medium text-[var(--text-secondary)] flex-shrink-0">
                {actName}
              </div>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {act.map((floor, j) => (
                  <MapNode
                    key={j}
                    floor={floor}
                    floorNum={actStartFloor + j}
                    bp={bp}
                    buildId={run.build_id}
                    cardTitle={cardTitle}
                    relicData={relicData}
                    potionData={potionData}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Relics row, uses RelicPill tooltip */}
      <div className="mb-4">
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          <span className="font-semibold">
            {t("Relics")} ({player.relics.length}):
          </span>{" "}
          <RaritySummary buckets={relicsByRarity} t={t} />
        </div>
        <div className="flex flex-wrap gap-1">
          {player.relics.map((relic, i) => {
            const info = relicData[relic.id];
            return (
              <RelicPill
                key={`${relic.id}-${i}`}
                relicId={relic.id}
                relicData={relicData}
                bp={bp}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-scrim/30 flex items-center justify-center hover:bg-scrim/50 transition-colors"
              >
                {info?.image_url ? (
                  <img
                    src={imageUrl(info.image_url)}
                    alt={gt(`relics.${relic.id}.title`) ?? info.name}
                    className="w-full h-full object-contain p-0.5"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span className="text-[8px] text-[var(--text-muted)]">
                    {relic.id.slice(0, 3)}
                  </span>
                )}
              </RelicPill>
            );
          })}
        </div>
      </div>

      {/* Cards grid, card art thumbnails + CardPill tooltip */}
      <div>
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          <span className="font-semibold">
            {t("Cards")} ({player.deck.length}):
          </span>{" "}
          <RaritySummary buckets={cardsByRarity} t={t} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
          {stackedCards.map((entry, i) => {
            const info = cardData[entry.id];
            const colorClass = cardLabelColor(
              entry.upgraded,
              !!entry.enchantment,
            );
            return (
              <CardPill
                key={`${entry.id}-${entry.upgraded ? "u" : "n"}-${entry.enchantment ?? ""}-${i}`}
                cardId={entry.id}
                upgraded={entry.upgraded}
                enchantment={entry.enchantment}
                cardData={cardData}
                bp={bp}
                className="flex items-center gap-1.5 text-xs hover:bg-[var(--bg-card-hover)] rounded px-1 py-0.5 transition-colors"
              >
                <TinyCard
                  color={info?.color}
                  type={info?.type}
                  rarity={info?.rarity}
                />
                <span className={`truncate ${colorClass}`}>
                  {entry.count > 1 && (
                    <span className="text-[var(--text-muted)] mr-1">
                      {entry.count}x
                    </span>
                  )}
                  {cardTitle(entry.id)}
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
  floor,
  floorNum,
  bp,
  buildId,
  cardTitle,
  relicData,
  potionData,
}: {
  floor: Floor;
  floorNum: number;
  bp: string;
  buildId?: string;
  cardTitle: (id: string) => string;
  relicData: Record<string, RelicInfo>;
  potionData: Record<string, PotionInfo>;
}) {
  const t = useT();
  const gt = useTryGameTranslations();
  const [show, setShow] = useState(false);
  const { src, betaSrc, tier, label } = iconFor(floor, gt, buildId);
  const room = typedRoom(floor);
  const ps = floor.player_stats[0];
  const relicTitle = (id: string) =>
    gt(`relics.${id}.title`) ??
    relicData[id]?.name ??
    displayName(`RELIC.${id}`);
  const potionTitle = (id: string) =>
    gt(`potions.${id}.title`) ??
    potionData[id]?.name ??
    displayName(`POTION.${id}`);
  const pickTitle = (table: string, id: string) => {
    if (table === "cards") return cardTitle(id);
    if (table === "potions") return potionTitle(id);
    return relicTitle(id);
  };

  // Click target, encounter/event detail page derived from the room.
  const href = floorHref(floor, bp);
  const turns =
    room?.type === "ENCOUNTER"
      ? (gt("run_history.MAP_POINT_HISTORY.turnsTaken", {
          Turns: room.turns_taken,
        }) ?? `${room.turns_taken} ${t("turns")}`)
      : undefined;
  const chose =
    ps?.event_choices
      ?.map((c) => eventChoiceName(c, gt))
      .filter((name): name is string => !!name) ?? [];
  const rested = ps?.rest_site_choices?.map((c) => restChoiceName(c, gt, t));
  const ancientPicks =
    ps?.ancient_choices
      ?.filter((c) => c.was_picked)
      .map((c) => pickTitle(c.table, c.id)) ?? [];

  const iconImg = (
    <img
      src={src}
      alt={label}
      className="w-full h-full object-contain p-0.5"
      crossOrigin="anonymous"
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        // Beta-only map icons (e.g. AEONGLASS) live only in the beta tree;
        // try the beta-versioned path once before giving up.
        if (betaSrc && img.dataset.triedBeta !== "1") {
          img.dataset.triedBeta = "1";
          img.src = betaSrc;
          return;
        }
        img.style.display = "none";
      }}
    />
  );

  const tooltip = show && (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold text-[var(--text-primary)]">
          {label}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {gt("run_history.MAP_POINT_HISTORY.header", { FloorNum: floorNum }) ??
            t("Floor {n}", { n: floorNum })}
        </div>
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mb-1.5 capitalize">
        {roomTypeTitle(floor, gt)}
        {tier && ` · ${t(TIER_LABELS[tier])}`}
        {turns && ` · ${turns}`}
      </div>
      {room?.type === "ENCOUNTER" && room.monsters.length > 0 && (
        <div className="text-[10px] text-[var(--text-secondary)] mb-1.5">
          {t("vs")}{" "}
          {room.monsters
            .map((m) => gt(`monsters.${m}.name`) ?? displayName(`MONSTER.${m}`))
            .join(", ")}
        </div>
      )}
      {ps && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--text-muted)] mb-1.5">
          <span>
            {t("HP")} {ps.current_hp}/{ps.max_hp}
          </span>
          {(ps.damage_taken ?? 0) > 0 && (
            <span style={{ color: "var(--color-ironclad)" }}>
              -{ps.damage_taken}
            </span>
          )}
          {(ps.hp_healed ?? 0) > 0 && (
            <span style={{ color: "var(--color-silent)" }}>
              +{ps.hp_healed} {t("HP")}
            </span>
          )}
          {(ps.gold_gained ?? 0) > 0 && (
            <span style={{ color: "var(--accent-gold)" }}>
              +{ps.gold_gained}g
            </span>
          )}
          {(ps.gold_spent ?? 0) > 0 && (
            <span style={{ color: "var(--text-muted)" }}>
              -{ps.gold_spent}g
            </span>
          )}
        </div>
      )}
      {rested && rested.length > 0 && (
        <div className="text-[10px] text-[var(--text-secondary)] mb-0.5">
          {rested.join(", ")}
        </div>
      )}
      {ps?.cards_gained && ps.cards_gained.length > 0 && (
        <div className="text-[10px] text-[var(--color-silent)] mb-0.5">
          + {ps.cards_gained.map((c) => cardTitle(c.id)).join(", ")}
        </div>
      )}
      {ps?.cards_removed && ps.cards_removed.length > 0 && (
        <div className="text-[10px] text-[var(--color-ironclad)] mb-0.5">
          − {ps.cards_removed.map((c) => cardTitle(c.id)).join(", ")}
        </div>
      )}
      {ps?.cards_transformed && ps.cards_transformed.length > 0 && (
        <div className="text-[10px] text-[var(--color-necrobinder)] mb-0.5">
          {ps.cards_transformed
            .map(
              (c) =>
                `${cardTitle(c.original_card.id)} → ${cardTitle(c.final_card.id)}`,
            )
            .join(", ")}
        </div>
      )}
      {ps?.upgraded_cards && ps.upgraded_cards.length > 0 && (
        <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
          ⬆ {ps.upgraded_cards.map((c) => cardTitle(c)).join(", ")}
        </div>
      )}
      {ps?.relic_choices?.some((r) => r.was_picked) && (
        <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
          +{" "}
          {ps.relic_choices
            .filter((r) => r.was_picked)
            .map((r) => relicTitle(r.choice))
            .join(", ")}
        </div>
      )}
      {ps?.potion_choices?.some((p) => p.was_picked) && (
        <div className="text-[10px] text-[var(--accent-teal)] mb-0.5">
          +{" "}
          {ps.potion_choices
            .filter((p) => p.was_picked)
            .map((p) => potionTitle(p.choice))
            .join(", ")}
        </div>
      )}
      {ancientPicks.length > 0 && (
        <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
          + {ancientPicks.join(", ")}
        </div>
      )}
      {chose.length > 0 && (
        <div className="text-[10px] text-[var(--text-secondary)] mt-1 italic">
          {gt("run_history.MAP_POINT_HISTORY.chose", {
            Choice: chose.join(", "),
          }) ?? t("chose {choice}", { choice: chose.join(", ") })}
        </div>
      )}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
    </div>
  );

  const wrapClass = `relative w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-scrim/30 flex items-center justify-center ${TIER_OUTLINE[tier] ?? ""}`;

  if (href) {
    return (
      <Link
        href={href}
        className={`${wrapClass} hover:bg-scrim/50 hover:ring-2 hover:ring-[var(--accent-gold)]/60 transition-all`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {iconImg}
        {tooltip}
      </Link>
    );
  }

  return (
    <span
      className={wrapClass}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {iconImg}
      {tooltip}
    </span>
  );
}

function IconStat({
  icon,
  alt,
  value,
  color,
}: {
  icon: string;
  alt: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
      <img
        src={icon}
        alt={alt}
        className="w-5 h-5 object-contain"
        crossOrigin="anonymous"
      />
      <span className="font-semibold" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

function PotionSlots({
  potions,
  total,
  potionData,
  bp,
}: {
  potions: { id: string; slot_index: number }[];
  total: number;
  potionData: Record<string, PotionInfo>;
  bp: string;
}) {
  const gt = useTryGameTranslations();
  // Sort potions into a slot array so empty slots render as dashed outlines.
  const bySlot: ((typeof potions)[number] | null)[] = Array(total).fill(null);
  for (const p of potions) {
    if (p.slot_index >= 0 && p.slot_index < total) bySlot[p.slot_index] = p;
  }
  return (
    <div className="flex items-center gap-1">
      {bySlot.map((p, i) => {
        if (!p) {
          return (
            <span
              key={i}
              className="w-5 h-5 rounded-sm border border-dashed border-[var(--border-subtle)]"
            />
          );
        }
        const info = potionData[p.id];
        return (
          <PotionPill
            key={i}
            potionId={p.id}
            potionData={potionData}
            bp={bp}
            className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-transform"
          >
            {info?.image_url ? (
              <img
                src={imageUrl(info.image_url)}
                alt={gt(`potions.${p.id}.title`) ?? info.name}
                className="w-5 h-5 object-contain"
                crossOrigin="anonymous"
              />
            ) : (
              <span className="w-5 h-5 rounded-sm bg-[var(--color-silent)]/50" />
            )}
          </PotionPill>
        );
      })}
    </div>
  );
}

function RaritySummary({
  buckets,
  t,
}: {
  buckets: Map<string, number>;
  t: TFn;
}) {
  const parts: string[] = [];
  for (const r of RARITY_ORDER) {
    const n = buckets.get(r);
    if (n) parts.push(`${n} ${t(r)}`);
  }
  return <span className="text-[var(--text-muted)]">{parts.join(", ")}</span>;
}

function bucketByRarity<T>(
  items: T[],
  getRarity: (item: T) => string | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    const r = getRarity(item) ?? "Unknown";
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return m;
}

function lastPlayerStats(run: Run): PlayerStats | undefined {
  const acts = run.floor_history;
  for (let a = acts.length - 1; a >= 0; a--) {
    for (let f = acts[a].length - 1; f >= 0; f--) {
      const ps = acts[a][f]?.player_stats[0];
      if (ps) return ps;
    }
  }
  return undefined;
}
