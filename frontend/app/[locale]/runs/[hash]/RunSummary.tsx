"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useGameLocale, useT } from "@/lib/i18n";
import { hreflangOf } from "@/lib/locale";
import { Link } from "@/i18n/navigation";
import { useTryGameTranslations } from "@/lib/game-i18n";
import type { Player, PlayerStats, Run } from "@/lib/api/run/types";
import { imageUrl } from "@/lib/image-url";
import { fmtDateTime, fmtDateTimePacific } from "@/lib/pacific";
import { textColor } from "@/lib/character-colors";
import { PlayerBadge } from "@/app/components/SupporterBadge";
import { OwnerTheme } from "@/app/components/OwnerTheme";
import PlayerLink from "@/app/components/PlayerLink";
import { playerRunsHref } from "@/lib/player-pages";
import { gameModeLabel } from "@/lib/game-modes";
import {
  displayName,
  type CardInfo,
  type RelicInfo,
  type PotionInfo,
} from "./RunPills";
import { characterTitle, seatStats } from "./run-names";
import { RankChip, SeedStanding, useRunStanding } from "./RunStanding";
import RunPath, { type RunOutcome } from "./RunPath";
import { RunDeck, RunRelics } from "./RunLoadout";
import { CompetitiveTag } from "../../live/live-shared";

export type { PotionInfo };

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

function modeLabel(mode: string | undefined): string {
  if (!mode) return "Standard";
  return (
    gameModeLabel(mode) ||
    mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase()
  );
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

interface Props {
  run: Run;
  hash?: string;
  player: Player;
  seat: number;
  onSeat: (seat: number) => void;
  cardData: Record<string, CardInfo>;
  relicData: Record<string, RelicInfo>;
  potionData: Record<string, PotionInfo>;
  charColor: string;
  charLinked: boolean;
  langPrefix: string;
  charName: string;
  killedBy?: { href: string; name: string };
  showDetails: boolean;
  onToggleDetails: () => void;
}

export default function RunSummary({
  run,
  hash,
  player,
  seat,
  onSeat,
  cardData,
  relicData,
  potionData,
  charColor,
  charLinked,
  langPrefix: bp,
  charName,
  killedBy,
  showDetails,
  onToggleDetails,
}: Props) {
  const t = useT();
  const gt = useTryGameTranslations();
  const dateLocale = hreflangOf(useGameLocale());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ownSeat = seat === (run.player_index ?? 0);
  const finalStats = lastPlayerStats(run, player, seat);
  const standing = useRunStanding(
    run.hidden ? undefined : hash,
    run.players.length > 1 ? undefined : run.seed,
    run.win,
  );
  const totalFloors = run.floor_history.reduce(
    (sum, act) => sum + act.length,
    0,
  );
  const charSlug = player.character.toLowerCase();
  const outcome: RunOutcome = run.win
    ? "win"
    : run.was_abandoned
      ? "abandoned"
      : "loss";
  const names = {
    card: (id: string) =>
      gt(`cards.${id}.title`) ??
      cardData[id]?.name ??
      displayName(`CARD.${id}`),
    relic: (id: string) =>
      gt(`relics.${id}.title`) ??
      relicData[id]?.name ??
      displayName(`RELIC.${id}`),
    potion: (id: string) =>
      gt(`potions.${id}.title`) ??
      potionData[id]?.name ??
      displayName(`POTION.${id}`),
  };

  const charAvatar = (
    <img
      src={imageUrl(
        `/static/images/characters/character_icon_${charSlug}.webp`,
      )}
      alt=""
      className="w-14 h-14 rounded-full object-cover border-2"
      style={{ borderColor: charColor }}
      crossOrigin="anonymous"
    />
  );
  return (
    <>
      <div
        className="rounded-xl border p-4 sm:p-5 mb-4"
        style={{
          borderColor: `color-mix(in srgb, ${charColor} 40%, transparent)`,
          background: `color-mix(in srgb, ${charColor} 8%, var(--bg-card))`,
        }}
      >
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          {charLinked ? (
            <Link
              href={`${bp}/characters/${charSlug}`}
              className="flex-shrink-0"
              aria-label={charName}
            >
              {charAvatar}
            </Link>
          ) : (
            <span className="flex-shrink-0">{charAvatar}</span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-bold leading-tight">
              <span
                style={{
                  color:
                    outcome === "win"
                      ? "var(--color-silent)"
                      : outcome === "abandoned"
                        ? "var(--text-muted)"
                        : "var(--color-ironclad)",
                }}
              >
                {outcome === "win"
                  ? t("Victory")
                  : outcome === "abandoned"
                    ? t("Abandoned")
                    : t("Defeat")}
              </span>
              {charLinked ? (
                <Link
                  href={`${bp}/characters/${charSlug}`}
                  className="text-lg font-normal hover:underline"
                  style={{ color: textColor(charColor) }}
                >
                  {charName}
                </Link>
              ) : (
                <span
                  className="text-lg font-normal"
                  style={{ color: textColor(charColor) }}
                >
                  {charName}
                </span>
              )}
              {ownSeat && run.competitive && (
                <Link
                  href={`${bp}/competitive`}
                  className="self-center text-base font-normal leading-none"
                >
                  <CompetitiveTag state={run.competitive.state} t={t} />
                </Link>
              )}
            </h1>
            {killedBy && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {t("Killed by")}{" "}
                <Link
                  href={killedBy.href}
                  className="font-medium hover:underline"
                  style={{ color: "var(--color-ironclad)" }}
                >
                  {killedBy.name}
                </Link>
              </p>
            )}
            {ownSeat && standing.rank && (
              <div className="mt-1.5">
                <RankChip
                  rank={standing.rank}
                  character={player.character}
                  charName={charName.replace(/^The /, "")}
                  bp={bp}
                />
              </div>
            )}
          </div>
          <div className="w-full sm:w-auto sm:max-w-[50%] text-left sm:text-right text-sm text-[var(--text-muted)] leading-snug">
            <OwnerTheme username={run.username} />
            {run.username && ownSeat && (
              <div className="truncate">
                <span className="text-[var(--text-secondary)]">{t("by")} </span>
                <PlayerLink
                  username={run.username}
                  fallback="runs"
                  className="font-medium text-[var(--text-primary)]"
                />
                <PlayerBadge username={run.username} className="ml-1" />
                <span className="mx-1">·</span>
                <Link
                  prefetch={false}
                  href={playerRunsHref(bp, run.username)}
                  className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:underline"
                  title={t("View all runs by this player")}
                >
                  {t("Runs")}
                </Link>
              </div>
            )}
            {Number(run.start_time) > 0 && (
              <div className="truncate" suppressHydrationWarning>
                {formatDate(Number(run.start_time), mounted, dateLocale)}
              </div>
            )}
            {run.seed && <SeedStanding seed={run.seed} standing={standing} />}
            <div className="truncate">
              {t(modeLabel(run.game_mode))}
              {run.build_id && <span className="ml-1">· {run.build_id}</span>}
            </div>
          </div>
        </div>

        <dl className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex flex-wrap gap-x-6 gap-y-3">
          <Stat
            icon="/static/images/ui/top_bar/top_bar_ascension.webp"
            label={t("Ascension")}
            value={run.ascension ?? 0}
            color="var(--accent-gold)"
          />
          <Stat
            icon="/static/images/ui/top_bar/top_bar_map.webp"
            label={t("Floor")}
            value={totalFloors}
          />
          <Stat
            icon="/static/images/ui/top_bar/timer_icon.webp"
            label={t("Time")}
            value={formatTime(run.run_time ?? 0)}
          />
          <Stat
            icon="/static/images/ui/top_bar/top_bar_heart.webp"
            label={t("HP")}
            value={`${finalStats?.current_hp ?? "?"}/${finalStats?.max_hp ?? "?"}`}
            color="var(--color-ironclad)"
          />
          <Stat
            icon="/static/images/ui/top_bar/top_bar_gold.webp"
            label={t("Gold")}
            value={finalStats?.current_gold ?? "?"}
            color="var(--accent-gold)"
          />
        </dl>

        {run.players.length > 1 && (
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-[var(--text-secondary)]">
              {t("Party")}
            </span>
            {run.players.map((p, i) => {
              const active = i === seat;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSeat(i)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 min-h-11 rounded-lg border px-2.5 text-sm transition-colors ${
                    active
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <img
                    src={imageUrl(
                      `/static/images/characters/character_icon_${p.character.toLowerCase()}.webp`,
                    )}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                    crossOrigin="anonymous"
                  />
                  {characterTitle(p.character, gt)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <RunPath
        run={run}
        player={player}
        seat={seat}
        names={names}
        bp={bp}
        outcome={outcome}
        showDetails={showDetails}
        onToggleDetails={onToggleDetails}
      />
      <RunRelics
        player={player}
        relicData={relicData}
        potionData={potionData}
        bp={bp}
      />
      <RunDeck player={player} cardData={cardData} bp={bp} />
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={imageUrl(icon)}
        alt=""
        className="w-7 h-7 object-contain"
        crossOrigin="anonymous"
      />
      <div className="flex flex-col-reverse leading-tight">
        <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
        <dd
          className="text-base font-semibold tabular-nums text-[var(--text-primary)]"
          style={color ? { color } : undefined}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

function lastPlayerStats(
  run: Run,
  player: Player,
  seat: number,
): PlayerStats | undefined {
  const acts = run.floor_history;
  for (let a = acts.length - 1; a >= 0; a--) {
    for (let f = acts[a].length - 1; f >= 0; f--) {
      const ps = seatStats(acts[a][f], player, seat);
      if (ps) return ps;
    }
  }
  return undefined;
}
