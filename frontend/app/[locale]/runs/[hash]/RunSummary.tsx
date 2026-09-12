"use client";

import {
  useGameLocale,
  useGameTranslations,
  useT,
  useTryGameTranslations,
} from "@/lib/i18n";
import { hreflangOf } from "@/lib/locale";
/**
 * In-game-style summary of a run, mimicking the victory/defeat screen.
 * Renders three act rows of map node icons + relic strip + card grid.
 */

import { useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import TinyCard from "@/app/components/TinyCard";
import { CardPill, RelicPill, PotionPill } from "./RunPills";
import { imageUrl } from "@/lib/image-url";
import { fmtDateTime, fmtDateTimePacific } from "@/lib/pacific";
import CardsContext from "@/app/contexts/api/Cards";
import RelicsContext from "@/app/contexts/api/Relics";
import {
  useCleanLocalize,
  useEventChoiceLocalize,
  useMapPointLocalize,
  useRoomLocalize,
} from "./cleanLocalize";
import PotionsContext from "@/app/contexts/api/Potions";
import {
  MapPoint,
  Run,
  Player,
  DeckCard,
  RawPlayerStats,
  LocalizationKey,
  Floor,
  Event,
  Encounter,
  RawRoom,
  Room,
  EncounterType,
} from "../../../contexts/api/run/types";
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

// const MAP_POINT_LABELS: Record<string, string> = {
//   monster: "Monster",
//   elite: "Elite",
//   boss: "Boss",
//   event: "Event",
//   treasure: "Treasure",
//   rest_site: "Rest Site",
//   shop: "Shop",
//   ancient: "Ancient",
//   unknown: "Unknown",
// };

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
  encounter: Encounter,
): "weak" | "normal" | "elite" | "boss" | "" {
  switch (encounter.encounter_type) {
    case "ENEMY":
      return encounter.id.endsWith("_WEAK") ? "weak" : "normal";
    case "ELITE":
      return "elite";
    case "BOSS":
      return "boss";
  }
}

/** Derive a spire-codex page href from an entity id by its prefix. */
// doesn't work on the purified content
// function entityHref(id: string, bp: string): string | null {
//   if (!id || id === "NONE.NONE") return null;
//   const slug = id;
//   if (id.startsWith("MONSTER.")) return `${bp}/monsters/${slug}`;
//   if (id.startsWith("ENCOUNTER.")) return `${bp}/encounters/${slug}`;
//   if (id.startsWith("EVENT.")) return `${bp}/events/${slug}`;
//   if (id.startsWith("RELIC.")) return `${bp}/relics/${slug}`;
//   if (id.startsWith("CARD.")) return `${bp}/cards/${slug}`;
//   if (id.startsWith("POTION.")) return `${bp}/potions/${slug}`;
//   if (id.startsWith("CHARACTER.")) return `${bp}/characters/${slug}`;
//   return null;
// }

function roomHref(room: Room, bp: string): string | undefined {
  switch (room.type) {
    case "ENCOUNTER":
      return `${bp}/monsters/${room.id}`;
    case "EVENT":
      return `${bp}/encounters/${room.id}`;
    case "MERCHANT":
      return `${bp}/merchant`;
    case "REST":
      return `{bp}/mechanics/campfire/options`;
    case "TREASURE":
      return undefined;
  }
}

/** Resolve the icon filename for a map point. */
function iconFor(
  floor: Floor,
  tryGT: ReturnType<typeof useTryGameTranslations>,
  buildId?: string,
): { src: string; betaSrc?: string; tier: string; alt?: string } {
  // todo: process multiple rooms
  const room = floor.rooms?.[0];
  const modelId = room?.id || "";
  const tier = 'encounter_type' in room ? encounterTier(room) : undefined;
  const alt = tryGT(.);

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

  if (mp.map_point_type === "boss" && modelId.endsWith("_BOSS")) {
    const slug = modelId.toLowerCase();
    return { ...resolve(slug), tier, alt };
  }
  if (mp.map_point_type === "ancient" && modelId.startsWith("EVENT.")) {
    const slug = modelId.toLowerCase();
    return { ...resolve(slug), tier: "", alt };
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
  return { ...resolve(slug), tier, alt };
}

interface Props {
  run: Run;
  player: Player;
  charColor: string;
  langPrefix: string;
}

// TODO: LOCALISE NUMBERS!
export default function RunSummary({
  run,
  player,
  charColor,
  langPrefix,
}: Props) {
  const t = useT();

  const gT = useGameTranslations();
  const tryGT = useTryGameTranslations();
  const dateLocale = hreflangOf(useGameLocale());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cards = useContext(CardsContext);
  const relics = useContext(RelicsContext);
  const stackedCards = useStackCards(player.deck);

  if (cards && relics) {
    const charName =
      tryGT(`characters.${player.character}.title`) ?? player.character;
    const encounterName =
      run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE"
        ? (tryGT(`encounters.${run.killed_by_encounter}.title`) ??
          run.killed_by_encounter)
        : undefined;
    // todo: killed by event
    const finalStats = lastPlayerStats(run);
    const totalFloors = (run.floor_history ?? []).reduce(
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
      ? t("{char} ascended.", {
          char: charName,
        })
      : run.was_abandoned
        ? t("The journey ended.")
        : encounterName
          ? t("{char} fell to {encounter}.", {
              char: charName,
              encounter: encounterName,
            })
          : t("{char} fell.", { char: charName });

    const relicRarities = player.relics.map(({ id }) => relics?.[id]?.rarity);
    const cardRarities = player.deck.map(({ id }) => cards?.[id]?.rarity);
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
          <Link
            href={`${langPrefix}/characters/${charSlug}`}
            className="flex-shrink-0"
          >
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
            bp={langPrefix}
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
              icon={imageUrl(
                "/static/images/ui/top_bar/top_bar_ascension.webp",
              )}
              alt={t("Ascension")}
              value={`A${run.ascension}`}
              color="var(--accent-gold)"
            />
          )}
          <div className="w-full sm:w-auto sm:ml-auto text-left sm:text-right text-xs text-[var(--text-muted)] leading-tight">
            {run.username && (
              <div className="truncate">
                <Link
                  href={`${langPrefix}/runs?username=${encodeURIComponent(run.username)}`}
                  className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:underline"
                  title={t("View all runs by this player")}
                >
                  {t("by")}{" "}
                  <span className="font-medium text-[var(--text-primary)]">
                    {run.username}
                  </span>
                </Link>
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
          {(run.floor_history ?? []).map((act, i) => {
            const actId = run.acts?.[i];
            const actName =
              (actId ? tryGT(`acts.${actId}.title`) : undefined) ??
              t("Act {n}", { n: i + 1 });
            const actStartFloor =
              (run.floor_history ?? [])
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
                      langPrefix={langPrefix}
                      buildId={run.build_id}
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
            <RaritySummary rarities={relicRarities} itemKind="relic" />
          </div>
          <div className="flex flex-wrap gap-1">
            {player.relics.map((relic, i) => {
              const info = relics[relic.id];
              return (
                <RelicPill
                  key={`${relic.id}-${i}`}
                  relicId={relic.id}
                  bp={langPrefix}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-scrim/30 flex items-center justify-center hover:bg-scrim/50 transition-colors"
                >
                  {info?.image_url ? (
                    <img
                      src={imageUrl(info.image_url)}
                      alt={tryGT(`relics.${relic.id}.title`) ?? relic.id}
                      className="w-full h-full object-contain p-0.5"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <span className="text-[8px] text-[var(--text-muted)]">
                      {/*todo: what is this for?*/}
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
            <RaritySummary rarities={cardRarities} itemKind="card" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
            {stackedCards.map((entry, i) => {
              const card = cards[entry.id];
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
                  bp={langPrefix}
                  className="flex items-center gap-1.5 text-xs hover:bg-[var(--bg-card-hover)] rounded px-1 py-0.5 transition-colors"
                >
                  <TinyCard
                    color={card?.color}
                    type={card?.type}
                    rarity={card?.rarity}
                  />
                  <span className={`truncate ${colorClass}`}>
                    {entry.count > 1 && (
                      <span className="text-[var(--text-muted)] mr-1">
                        {entry.count}x
                      </span>
                    )}
                    {tryGT(`cards.${entry.id}.title`) ?? entry.id}
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
}

function MapNode({
  floor,
  floorNum,
  langPrefix,
  buildId,
}: {
  floor: Floor;
  floorNum: number;
  langPrefix: string;
  buildId?: string;
}) {
  const t = useT();
  const tryGT = useTryGameTranslations();
  const eventT = useEventChoiceLocalize();
  const [show, setShow] = useState(false);
  const { src, betaSrc, tier, alt } = iconFor(floor, tryGT, buildId);
  const room = floor.rooms?.[0];
  const ps = floor.player_stats?.[0];
  let room_id = room.type === "EVENT" || room.type === "ENCOUNTER" ? (room as Event | Encounter).id : undefined;
  // Click target, encounter/event detail page derived from the room's model_id.
  const href = entityHref(
    ,
    langPrefix,
  );

  const iconImg = (
    <img
      src={src}
      alt={alt} // todo: I think image alts are supposed to be more descriptive?
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
          {alt}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {t("Floor {n}", { n: floorNum })}
        </div>
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mb-1.5 capitalize">
        {mapT(mp.map_point_type)}
        {tier && ` · ${t(TIER_LABELS[tier])}`}
        {room?.turns_taken != null && ` · ${room.turns_taken} ${t("turns")}`}
      </div>
      {room?.monster_ids && room.monster_ids.length > 0 && (
        <div className="text-[10px] text-[var(--text-secondary)] mb-1.5">
          {t("vs")}{" "}
          {room.monster_ids
            .map((m) => cleanT((id) => `monsters.${id}.name`, m))
            .join(", ")}
        </div>
      )}
      {ps && (
        <>
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
          {ps.cards_gained && ps.cards_gained.length > 0 && (
            <div className="text-[10px] text-[var(--color-silent)] mb-0.5">
              +{" "}
              {ps.cards_gained
                .map(({ id }) => cleanT((id) => `cards.${id}.name`, id))
                .join(", ")}
            </div>
          )}
          {ps?.cards_removed && ps.cards_removed.length > 0 && (
            <div className="text-[10px] text-[var(--color-ironclad)] mb-0.5">
              −{" "}
              {ps.cards_removed
                .map(({ id }) => cleanT((id) => `cards.${id}.name`, id))
                .join(", ")}
            </div>
          )}
          {ps?.upgraded_cards && ps.upgraded_cards.length > 0 && (
            <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
              ⬆{" "}
              {ps.upgraded_cards
                .map((id) => cleanT((id) => `cards.${id}.name`, id))
                .join(", ")}
            </div>
          )}
          {ps?.relic_choices?.some((r) => r.was_picked) && (
            <div className="text-[10px] text-[var(--accent-gold)] mb-0.5">
              +{" "}
              {ps.relic_choices
                .filter((r) => r.was_picked)
                .map((r) => cleanT((id) => `relics.${id}.name`, r.choice))
                .join(", ")}
            </div>
          )}
          {/*todo: upgrade to show things like smith as the choice?*/}
          {ps.event_choices && ps.event_choices.length > 0 && (
            <div className="text-[10px] text-[var(--text-secondary)] mt-1 italic">
              {t("chose {choice}", {
                choice: ps.event_choices
                  .map((x) => x.title)
                  .filter((x): x is LocalizationKey => !!x)
                  .map((lookup) => eventT(lookup))
                  .join(", "),
              })}
            </div>
          )}
        </>
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

function humanizeChoiceKey(key: string): string {
  // Event choices are stored as the game's localization key, e.g.
  // "MORPHIC_GROVE.pages.INITIAL.options.LONER.title" → "Loner". Pull the
  // segment after "options" when the event had a branching choice.
  const parts = key.split(".");
  const idx = parts.findIndex((p) => p === "options");
  if (idx >= 0 && parts[idx + 1]) {
    return parts[idx + 1]
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // No "options" segment means there was no real choice: ancients and other
  // single-outcome events record a page key like
  // "ancients.NONUPEIPE.pages.DONE.description". Returning the raw dotted key
  // would leak it onto the page, so drop it (the caller skips the line). A
  // plain, dot-free label is already human and passes through.
  return key.includes(".") ? "" : key;
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
  bp,
}: {
  potions: { id: string; slot_index: number }[];
  total: number;
  bp: string;
}) {
  const potionData = useContext(PotionsContext);
  const cleanT = useCleanLocalize();
  if (potionData) {
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
          const potion = potionData[cleanId(p.id)];
          // todo: I think the children probably belong in the pill
          return (
            <PotionPill
              key={i}
              potionId={p.id}
              bp={bp}
              className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-transform"
            >
              {potion?.image_url ? (
                <img
                  src={imageUrl(potion.image_url)}
                  alt={cleanT((id) => `potions.${id}.name`, p.id)}
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
}

function RaritySummary({
  rarities,
  itemKind,
}: {
  rarities: string[];
  itemKind: string;
}) {
  const counts = countUniques(rarities);
  // note: technically we should cache the input key to this I think but react compiler might handle it for us, worth checking
  const gT = useTryGameTranslations({
    namespace: `translations.${itemKind}_rarities`,
  });
  const parts = RARITY_ORDER.map((rarity): [string, number] => [
    rarity,
    counts.get(rarity) ?? 0,
  ])
    .filter(([, count]) => count > 0)
    .map(([rarity, n]) => `${n} ${gT(rarity)}`);
  return <span className="text-[var(--text-muted)]">{parts.join(", ")}</span>;
}

function countUniques(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

interface StackEntry {
  id: string;
  upgraded: boolean;
  enchantment?: string;
  count: number;
}

function useStackCards(deck: DeckCard[]): StackEntry[] {
  const gT = useTryGameTranslations({ namespace: "cards" });
  const cards = useContext(CardsContext);
  const map = new Map<string, StackEntry>();
  for (const card of deck) {
    const id = cleanId(card.id);
    const upgraded = !!card.current_upgrade_level;
    const enchantment = card.enchantment
      ? cleanId(card.enchantment.id)
      : undefined;
    const key = `${id}::${upgraded}::${enchantment ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { id, upgraded, enchantment, count: 1 });
    }
  }
  const rarityScore: Record<string, number> = {
    Rare: 5,
    Uncommon: 4,
    Common: 3,
    Starter: 1,
    Curse: 0,
    Status: 0,
  };
  return [...map.values()].sort((a, b) => {
    const ra = rarityScore[cards?.[a.id]?.rarity ?? ""] ?? 2;
    const rb = rarityScore[cards?.[b.id]?.rarity ?? ""] ?? 2;
    if (ra !== rb) return rb - ra;
    return (gT(`${a.id}.name`) ?? a.id).localeCompare(
      gT(`${a.id}.name`) ?? b.id,
    );
  });
}

function lastPlayerStats(run: CleanRun): RawPlayerStats | undefined {
  const acts = run.map_point_history ?? [];
  for (let a = acts.length - 1; a >= 0; a--) {
    for (let f = acts[a].length - 1; f >= 0; f--) {
      const ps = acts[a][f]?.player_stats?.[0];
      if (ps) return ps;
    }
  }
  return undefined;
}
