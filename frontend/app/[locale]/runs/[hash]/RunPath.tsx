"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useT, type TFn } from "@/lib/i18n";
import { useTryGameTranslations, type TryGameT } from "@/lib/game-i18n";
import { imageUrl } from "@/lib/image-url";
import type {
  EncounterRoom,
  Floor,
  Player,
  PlayerStats,
  Run,
} from "@/lib/api/run/types";
import { displayName } from "./RunPills";
import {
  eventChoiceName,
  restChoiceName,
  roomTitle,
  roomTypeTitle,
  seatStats,
  typedRoom,
} from "./run-names";

const ICON_BASE = imageUrl("/static/images/ui/run_history");

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

const ROOM_COLORS: Record<string, string> = {
  monster: "var(--text-secondary)",
  elite: "var(--accent-gold)",
  boss: "var(--color-ironclad)",
  rest: "var(--color-silent)",
  rest_site: "var(--color-silent)",
  shop: "var(--accent-teal)",
  event: "var(--color-necrobinder)",
  treasure: "var(--accent-gold)",
};

export type RunOutcome = "win" | "abandoned" | "loss";

export interface Names {
  card: (id: string) => string;
  relic: (id: string) => string;
  potion: (id: string) => string;
}

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

function floorHref(floor: Floor, bp: string): string | null {
  const room = typedRoom(floor);
  if (room?.type === "ENCOUNTER")
    return `${bp}/encounters/${room.id.toLowerCase()}`;
  if (room?.type === "EVENT") return `${bp}/events/${room.id.toLowerCase()}`;
  return null;
}

function isBoss(floor: Floor): boolean {
  const room = typedRoom(floor);
  return room?.type === "ENCOUNTER" && room.encounter_type === "BOSS";
}

function iconSources(
  floor: Floor,
  buildId?: string,
): { src: string; betaSrc?: string } {
  const room = typedRoom(floor);
  const resolve = (slug: string) => ({
    src: `${ICON_BASE}/${slug}.webp`,
    betaSrc: buildId
      ? imageUrl(`/static/images/beta/${buildId}/ui/run_history/${slug}.webp`)
      : undefined,
  });
  if (room?.type === "ENCOUNTER" && room.encounter_type === "BOSS")
    return resolve(room.id.toLowerCase());
  if (floor.floor_type === "ANCIENT" && room?.type === "EVENT")
    return resolve(room.id.toLowerCase());
  return resolve(ICON_SLUG[floor.raw_type] ?? "monster");
}

interface FloorFacts {
  title?: string;
  typeLabel: string;
  tier: string;
  turns?: string;
  monsters: string[];
  rested: string[];
  picked: string[];
  skipped: string[];
  gained: string[];
  removed: string[];
  transformed: string[];
  upgraded: string[];
  relics: string[];
  potions: string[];
  chose: string[];
}

function floorFacts(
  floor: Floor,
  ps: PlayerStats | undefined,
  names: Names,
  gt: TryGameT,
  t: TFn,
): FloorFacts {
  const room = typedRoom(floor);
  const pickedIds = new Set(
    ps?.card_choices?.filter((c) => c.was_picked).map((c) => c.card.id) ?? [],
  );
  const relics =
    ps?.relic_choices
      ?.filter((r) => r.was_picked)
      .map((r) => names.relic(r.choice)) ?? [];
  for (const c of ps?.ancient_choices ?? []) {
    if (!c.was_picked) continue;
    const name =
      c.table === "cards"
        ? names.card(c.id)
        : c.table === "potions"
          ? names.potion(c.id)
          : names.relic(c.id);
    if (!relics.includes(name)) relics.push(name);
  }
  return {
    title: roomTitle(floor, gt),
    typeLabel: roomTypeTitle(floor, gt, t),
    tier: room?.type === "ENCOUNTER" ? encounterTier(room) : "",
    turns:
      room?.type === "ENCOUNTER" && room.turns_taken != null
        ? (gt("run_history.MAP_POINT_HISTORY.turnsTaken", {
            Turns: room.turns_taken,
          }) ?? `${room.turns_taken} ${t("turns")}`)
        : undefined,
    monsters:
      room?.type === "ENCOUNTER"
        ? room.monsters.map(
            (m) => gt(`monsters.${m}.name`) ?? displayName(`MONSTER.${m}`),
          )
        : [],
    rested: ps?.rest_site_choices?.map((c) => restChoiceName(c, gt, t)) ?? [],
    picked:
      ps?.card_choices
        ?.filter((c) => c.was_picked)
        .map((c) => names.card(c.card.id)) ?? [],
    skipped:
      ps?.card_choices
        ?.filter((c) => !c.was_picked)
        .map((c) => names.card(c.card.id)) ?? [],
    gained:
      ps?.cards_gained
        ?.filter((c) => !pickedIds.has(c.id))
        .map((c) => names.card(c.id)) ?? [],
    removed: ps?.cards_removed?.map((c) => names.card(c.id)) ?? [],
    transformed:
      ps?.cards_transformed?.map(
        (c) =>
          `${names.card(c.original_card.id)} → ${names.card(c.final_card.id)}`,
      ) ?? [],
    upgraded: ps?.upgraded_cards?.map((id) => names.card(id)) ?? [],
    relics,
    potions:
      ps?.potion_choices
        ?.filter((p) => p.was_picked)
        .map((p) => names.potion(p.choice)) ?? [],
    chose:
      ps?.event_choices
        ?.map((c) => eventChoiceName(c, gt))
        .filter((name): name is string => !!name) ?? [],
  };
}

function FloorIcon({
  floor,
  buildId,
  alt,
  className,
}: {
  floor: Floor;
  buildId?: string;
  alt: string;
  className: string;
}) {
  const { src, betaSrc } = iconSources(floor, buildId);
  const [stage, setStage] = useState<{ src: string; step: number }>({
    src,
    step: 0,
  });
  const step = stage.src === src ? stage.step : 0;
  const ref = useRef<HTMLImageElement>(null);
  const fail = () => setStage({ src, step: step === 0 && betaSrc ? 1 : 2 });
  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth === 0)
      el.dispatchEvent(new Event("error"));
  }, []);
  if (step === 2) return null;
  return (
    <img
      ref={ref}
      src={step === 1 && betaSrc ? betaSrc : src}
      alt={alt}
      className={className}
      crossOrigin="anonymous"
      onError={fail}
    />
  );
}

function StatDeltas({ ps }: { ps: PlayerStats }) {
  return (
    <>
      {(ps.damage_taken ?? 0) > 0 && (
        <span style={{ color: "var(--color-ironclad)" }}>
          -{ps.damage_taken}
        </span>
      )}
      {(ps.hp_healed ?? 0) > 0 && (
        <span style={{ color: "var(--color-silent)" }}>+{ps.hp_healed}</span>
      )}
      {(ps.gold_gained ?? 0) > 0 && (
        <span style={{ color: "var(--accent-gold)" }}>+{ps.gold_gained}g</span>
      )}
      {(ps.gold_spent ?? 0) > 0 && <span>-{ps.gold_spent}g</span>}
    </>
  );
}

function FactLines({ facts, t }: { facts: FloorFacts; t: TFn }) {
  const gt = useTryGameTranslations();
  const has =
    facts.rested.length +
    facts.picked.length +
    facts.skipped.length +
    facts.gained.length +
    facts.removed.length +
    facts.transformed.length +
    facts.upgraded.length +
    facts.relics.length +
    facts.potions.length +
    facts.chose.length;
  if (!has) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {facts.rested.length > 0 && (
        <span className="text-[var(--text-secondary)]">
          {facts.rested.join(", ")}
        </span>
      )}
      {facts.chose.length > 0 && (
        <span className="italic text-[var(--text-secondary)]">
          {gt("run_history.MAP_POINT_HISTORY.chose", {
            Choice: facts.chose.join(", "),
          }) ?? t("chose {choice}", { choice: facts.chose.join(", ") })}
        </span>
      )}
      {facts.picked.length > 0 && (
        <span style={{ color: "var(--color-silent)" }}>
          +{facts.picked.join(", ")}
        </span>
      )}
      {facts.skipped.length > 0 && (
        <span className="text-[var(--text-muted)] line-through">
          {facts.skipped.join(", ")}
        </span>
      )}
      {facts.gained.length > 0 && (
        <span style={{ color: "var(--color-silent)" }}>
          +{facts.gained.join(", ")}
        </span>
      )}
      {facts.relics.length > 0 && (
        <span style={{ color: "var(--accent-gold)" }}>
          +{facts.relics.join(", ")}
        </span>
      )}
      {facts.potions.length > 0 && (
        <span style={{ color: "var(--accent-teal)" }}>
          +{facts.potions.join(", ")}
        </span>
      )}
      {facts.removed.length > 0 && (
        <span style={{ color: "var(--color-ironclad)" }}>
          −{facts.removed.join(", ")}
        </span>
      )}
      {facts.transformed.length > 0 && (
        <span style={{ color: "var(--color-necrobinder)" }}>
          {facts.transformed.join(", ")}
        </span>
      )}
      {facts.upgraded.length > 0 && (
        <span style={{ color: "var(--accent-gold)" }}>
          ⬆ {facts.upgraded.join(", ")}
        </span>
      )}
    </div>
  );
}

function FloorNode({
  floor,
  floorNum,
  ps,
  names,
  bp,
  buildId,
  ended,
}: {
  floor: Floor;
  floorNum: number;
  ps: PlayerStats | undefined;
  names: Names;
  bp: string;
  buildId?: string;
  ended: RunOutcome | null;
}) {
  const t = useT();
  const gt = useTryGameTranslations();
  const [show, setShow] = useState(false);
  const facts = floorFacts(floor, ps, names, gt, t);
  const label = facts.title ?? facts.typeLabel;
  const href = floorHref(floor, bp);
  const boss = isBoss(floor);
  const floorLabel =
    gt("run_history.MAP_POINT_HISTORY.header", { FloorNum: floorNum }) ??
    t("Floor {n}", { n: floorNum });

  const tooltip = show && (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left text-xs font-normal">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          {label}
        </div>
        <div className="text-[var(--text-muted)] whitespace-nowrap">
          {floorLabel}
        </div>
      </div>
      <div className="text-[var(--text-muted)] mb-1.5">
        {facts.typeLabel}
        {facts.tier && ` · ${t(TIER_LABELS[facts.tier])}`}
        {facts.turns && ` · ${facts.turns}`}
      </div>
      {facts.monsters.length > 0 && (
        <div className="text-[var(--text-secondary)] mb-1.5">
          {t("vs")} {facts.monsters.join(", ")}
        </div>
      )}
      {ps && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[var(--text-muted)] mb-1.5">
          <span>
            {t("HP")} {ps.current_hp}/{ps.max_hp}
          </span>
          <StatDeltas ps={ps} />
        </div>
      )}
      <FactLines facts={facts} t={t} />
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
    </div>
  );

  const endRing =
    ended === "loss"
      ? "ring-2 ring-danger"
      : ended === "abandoned"
        ? "ring-2 ring-[var(--text-muted)]"
        : "";
  const body = boss ? (
    <>
      <FloorIcon
        floor={floor}
        buildId={buildId}
        alt=""
        className="w-11 h-11 flex-shrink-0 object-contain"
      />
      <span className="min-w-0 pr-1">
        <span className="block text-sm font-semibold leading-tight text-[var(--text-primary)]">
          {label}
        </span>
        <span className="block text-xs text-[var(--text-muted)]">
          {[t("Boss"), facts.turns].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  ) : (
    <FloorIcon
      floor={floor}
      buildId={buildId}
      alt={label}
      className="w-full h-full object-contain p-1"
    />
  );
  const wrapClass = boss
    ? `relative flex items-center gap-2 rounded-lg bg-scrim/30 p-1.5 min-h-11 ${endRing || TIER_OUTLINE.boss}`
    : `relative flex items-center justify-center w-10 h-10 rounded-md bg-scrim/30 ${endRing || (TIER_OUTLINE[facts.tier] ?? "")}`;
  const hover = {
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false),
  };

  return href ? (
    <Link
      href={href}
      aria-label={`${floorLabel}: ${label}`}
      className={`${wrapClass} hover:bg-scrim/50 hover:ring-2 hover:ring-[var(--accent-gold)]/60 transition-all`}
      {...hover}
    >
      {body}
      {tooltip}
    </Link>
  ) : (
    <span className={wrapClass} {...hover}>
      {body}
      {tooltip}
    </span>
  );
}

function FloorRow({
  floor,
  floorNum,
  ps,
  names,
  bp,
  buildId,
}: {
  floor: Floor;
  floorNum: number;
  ps: PlayerStats | undefined;
  names: Names;
  bp: string;
  buildId?: string;
}) {
  const t = useT();
  const gt = useTryGameTranslations();
  const facts = floorFacts(floor, ps, names, gt, t);
  const href = floorHref(floor, bp);
  return (
    <li className="grid grid-cols-[1.5rem_1.75rem_minmax(0,1fr)] sm:grid-cols-[1.5rem_1.75rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2 border-b border-[var(--border-subtle)] last:border-0 text-sm">
      <span className="text-right tabular-nums text-[var(--text-muted)]">
        {floorNum}
      </span>
      <span className="w-7 h-7">
        <FloorIcon
          floor={floor}
          buildId={buildId}
          alt=""
          className="w-7 h-7 object-contain"
        />
      </span>
      <div className="min-w-0">
        <div>
          <span
            className="font-medium"
            style={{
              color: ROOM_COLORS[floor.raw_type] || "var(--text-secondary)",
            }}
          >
            {facts.typeLabel}
          </span>
          {facts.title &&
            (href ? (
              <Link
                href={href}
                prefetch={false}
                className="ml-2 text-[var(--text-primary)] hover:text-[var(--accent-gold)] hover:underline"
              >
                {facts.title}
              </Link>
            ) : (
              <span className="ml-2 text-[var(--text-primary)]">
                {facts.title}
              </span>
            ))}
          {facts.turns && (
            <span className="ml-2 text-[var(--text-muted)]">{facts.turns}</span>
          )}
        </div>
        {facts.monsters.length > 0 && (
          <div className="text-[var(--text-muted)]">
            {t("vs")} {facts.monsters.join(", ")}
          </div>
        )}
        <FactLines facts={facts} t={t} />
      </div>
      {ps && (
        <div className="col-start-3 sm:col-start-4 flex flex-wrap items-baseline gap-x-2 sm:justify-end tabular-nums text-[var(--text-muted)]">
          <StatDeltas ps={ps} />
          <span className="text-[var(--text-secondary)]">
            {ps.current_hp}/{ps.max_hp} {t("HP")}
          </span>
        </div>
      )}
    </li>
  );
}

export default function RunPath({
  run,
  player,
  seat,
  names,
  bp,
  outcome,
  showDetails,
  onToggleDetails,
}: {
  run: Run;
  player: Player;
  seat: number;
  names: Names;
  bp: string;
  outcome: RunOutcome;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  const t = useT();
  const gt = useTryGameTranslations();
  const acts = run.floor_history;
  const lastAct = acts.reduce((last, act, i) => (act.length ? i : last), -1);
  const outcomeLabel =
    outcome === "win"
      ? t("Victory")
      : outcome === "abandoned"
        ? t("Abandoned")
        : t("Defeat");
  const outcomeColor =
    outcome === "win"
      ? "var(--color-silent)"
      : outcome === "abandoned"
        ? "var(--text-muted)"
        : "var(--color-ironclad)";
  let seen = 0;
  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("Floor History")}
        </h2>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={showDetails}
          className="inline-flex items-center gap-2 min-h-11 sm:min-h-9 px-3 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
        >
          <span
            aria-hidden
            className={`inline-block transition-transform ${showDetails ? "rotate-90" : ""}`}
          >
            &gt;
          </span>
          {t("Details")}
        </button>
      </div>
      {acts.map((act, i) => {
        const actId = run.acts[i];
        const actName =
          (actId ? gt(`acts.${actId}.title`) : undefined) ??
          t("Act {n}", { n: i + 1 });
        const start = seen + 1;
        seen += act.length;
        if (!act.length) return null;
        const ends = i === lastAct;
        return (
          <section
            key={i}
            className="py-4 border-t border-[var(--border-subtle)] first:border-0"
          >
            <div className="sm:flex sm:items-start sm:gap-4">
              <div className="flex items-baseline gap-2 mb-2 sm:mb-0 sm:block sm:w-28 sm:flex-shrink-0 sm:pt-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {actName}
                </h3>
                <div className="text-xs text-[var(--text-muted)]">
                  {act.length > 1
                    ? `${t("Floors")} ${start}-${seen}`
                    : t("Floor {n}", { n: start })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                {act.map((floor, j) => {
                  const final = ends && j === act.length - 1;
                  return (
                    <FloorNode
                      key={j}
                      floor={floor}
                      floorNum={start + j}
                      ps={seatStats(floor, player, seat)}
                      names={names}
                      bp={bp}
                      buildId={run.build_id}
                      ended={final ? outcome : null}
                    />
                  );
                })}
                {ends && (
                  <span
                    className="ml-1 text-sm font-semibold"
                    style={{ color: outcomeColor }}
                  >
                    {outcomeLabel}
                  </span>
                )}
              </div>
            </div>
            {showDetails && (
              <ol className="mt-3">
                {act.map((floor, j) => (
                  <FloorRow
                    key={j}
                    floor={floor}
                    floorNum={start + j}
                    ps={seatStats(floor, player, seat)}
                    names={names}
                    bp={bp}
                    buildId={run.build_id}
                  />
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </section>
  );
}
