"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import BetaBadge from "@/app/components/BetaBadge";
import RichDescription from "@/app/components/RichDescription";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { imageUrl } from "@/lib/image-url";
import {
  modeAnchor,
  type GameModeNamed,
  type GameModeOffer,
  type GameModeRoom,
  type GameModeRow,
  type RarityOdds,
} from "@/lib/game-mode-rows";

type T = (key: string, values?: Record<string, string | number>) => string;

const PANEL =
  "bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)]";
const HEAD = "text-lg font-semibold text-[var(--text-primary)] mb-3";
const BODY = "text-sm text-[var(--text-secondary)] leading-relaxed";
const LINK =
  "underline decoration-[var(--border-accent)] underline-offset-4 transition-colors hover:text-[var(--accent-gold)] hover:decoration-[var(--accent-gold)]";

const RARITIES = ["Common", "Uncommon", "Rare"] as const;
const RARITY_TEXT: Record<string, string> = {
  Common: "text-[var(--text-secondary)]",
  Uncommon: "text-[var(--accent-teal)]",
  Rare: "text-[var(--accent-gold)]",
};
const RARITY_FILL: Record<string, string> = {
  Common: "bg-[var(--border-accent)]",
  Uncommon: "bg-[var(--accent-teal)]",
  Rare: "bg-[var(--accent-gold)]",
};

const DECK_OFFERS = new Set([
  "CARD_UPGRADE",
  "RANDOM_UPGRADES",
  "CARD_TRANSFORM",
  "CARD_REMOVAL",
  "CARD_ENCHANT",
]);
const ITEM_OFFERS = new Set(["POTIONS", "RELIC"]);
const OFFER_GROUPS = [
  "Deck services",
  "Card rewards",
  "Items",
  "Cursed offers",
] as const;

function offerGroup(entry: GameModeOffer): (typeof OFFER_GROUPS)[number] {
  if (entry.cursed) return "Cursed offers";
  if (entry.id && DECK_OFFERS.has(entry.id)) return "Deck services";
  if (entry.id && ITEM_OFFERS.has(entry.id)) return "Items";
  return "Card rewards";
}

function Art({
  src,
  size,
  lift,
}: {
  src?: string | null;
  size: number;
  lift?: boolean;
}) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl(src)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 object-contain ${lift ? "brightness-[1.7] saturate-[1.2]" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}

function roomRewards(mode: GameModeRow, room: GameModeRoom, t: T): ReactNode[] {
  const lines: ReactNode[] = [];
  const reward = mode.rewards?.find((r) => r.room === room.type);
  if (room.easy) {
    lines.push(
      <span key="easy" className="text-[var(--text-muted)]">
        {t("Easier fight")}
      </span>,
    );
  }
  if (reward) {
    lines.push(
      <span key="cards">
        <span className={`font-semibold ${RARITY_TEXT[reward.card_rarity]}`}>
          {t(reward.card_rarity)}
        </span>
        {": "}
        {t("Choose 1 of {n} cards", { n: reward.card_choices ?? 3 })}
      </span>,
    );
    if (reward.relics > 0) {
      lines.push(
        <span key="relics">{t("{n} relics", { n: reward.relics })}</span>,
      );
    }
    const potion =
      reward.potion === "always" ||
      (reward.potion === "after_first_fight" && !room.easy);
    if (potion) lines.push(<span key="potion">{t("Potion")}</span>);
  }
  if (room.type === "TREASURE" && mode.treasure_extra_relics) {
    lines.push(
      <span key="chest">
        {t("{n} relics", {
          n: 1 + mode.treasure_extra_relics.singleplayer,
        })}
      </span>,
    );
  }
  if (
    room.type === "SHOP" &&
    mode.merchant?.picks != null &&
    mode.merchant.offers_shown != null
  ) {
    lines.push(
      <a key="shop" href={`#${modeAnchor(mode.id)}-merchant`} className={LINK}>
        {t("Take {picks} of {shown}", {
          picks: mode.merchant.picks,
          shown: mode.merchant.offers_shown,
        })}
      </a>,
    );
  }
  return lines;
}

function ActTrack({ mode, t }: { mode: GameModeRow; t: T }) {
  const rooms = mode.act_rooms ?? [];
  const fight = mode.rewards?.find((r) => r.room === "MONSTER");
  const total = fight?.card_choices ?? 3;
  const boss = mode.rewards?.find((r) => r.room === "BOSS");
  return (
    <div className={`${PANEL} p-4 sm:p-5`}>
      <p className={`${BODY} mb-5 max-w-[65ch]`}>
        {t(
          "Every act is the same {n} floors in this order, with no branching paths.",
          { n: mode.floors_per_act ?? rooms.length },
        )}
      </p>
      <ol className="grid grid-cols-1 sm:grid-cols-8">
        {rooms.map((room, i) => (
          <li
            key={i}
            className="relative flex gap-3 pb-5 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
          >
            {i < rooms.length - 1 && (
              <span
                aria-hidden
                className="absolute left-5 top-10 bottom-0 w-px bg-[var(--border-accent)] sm:bottom-auto sm:left-1/2 sm:top-5 sm:h-px sm:w-full"
              />
            )}
            <span
              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-primary)] ring-1 ${
                room.type === "BOSS"
                  ? "ring-[var(--accent-gold)]"
                  : "ring-[var(--border-accent)]"
              }`}
            >
              <Art src={room.image_url} size={26} lift />
            </span>
            <div className="min-w-0 sm:px-1">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                <span className="mr-1.5 font-normal tabular-nums text-[var(--text-muted)]">
                  {i + 1}
                </span>
                {room.name}
              </div>
              <div className="mt-1 flex flex-col gap-0.5 text-xs leading-snug text-[var(--text-secondary)] sm:text-balance">
                {roomRewards(mode, room, t)}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div
        className={`${BODY} mt-5 space-y-1 border-t border-[var(--border-subtle)] pt-4`}
      >
        {!!mode.reward_upgrades_by_act?.length && (
          <p>
            {t("Upgraded card choices by act")}
            {": "}
            {mode.reward_upgrades_by_act.map((count, i) => (
              <span key={i} className="whitespace-nowrap">
                {i > 0 && ", "}
                {t("Act {n}", { n: i + 1 })}{" "}
                <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                  {count}/{total}
                </span>
              </span>
            ))}
          </p>
        )}
        {mode.treasure_extra_relics && (
          <p>
            {t(
              "In co-op each chest holds {n} extra relics and every player takes one.",
              { n: mode.treasure_extra_relics.multiplayer },
            )}
          </p>
        )}
        {boss?.final_boss === false && (
          <p>{t("No reward after the final boss")}</p>
        )}
      </div>
    </div>
  );
}

function OddsRows({
  rows,
  t,
}: {
  rows: { label: string; odds: RarityOdds }[];
  t: T;
}) {
  return (
    <figure className="max-w-xl">
      <figcaption className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        {t("Card rarity odds")}
      </figcaption>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="text-[var(--text-secondary)]">{row.label}</span>
              {RARITIES.map((rarity) => (
                <span key={rarity} className={RARITY_TEXT[rarity]}>
                  {t(rarity)}{" "}
                  <span className="font-semibold tabular-nums">
                    {Math.round(
                      row.odds[rarity.toLowerCase() as keyof RarityOdds] * 100,
                    )}
                    %
                  </span>
                </span>
              ))}
            </div>
            <div
              aria-hidden
              className="flex h-2 gap-px overflow-hidden rounded-sm"
            >
              {RARITIES.map((rarity) => (
                <span
                  key={rarity}
                  className={RARITY_FILL[rarity]}
                  style={{
                    width: `${row.odds[rarity.toLowerCase() as keyof RarityOdds] * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

function NamedLinks({
  rows,
  path,
  bp,
}: {
  rows: GameModeNamed[];
  path: string;
  bp: string;
}) {
  return (
    <>
      {rows.map((row, i) => (
        <span key={row.id}>
          {i > 0 && ", "}
          <Link href={`${bp}/${path}/${row.id.toLowerCase()}`} className={LINK}>
            {row.name}
          </Link>
        </span>
      ))}
    </>
  );
}

function RelicGrid({ rows, bp }: { rows: GameModeNamed[]; bp: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`${bp}/relics/${row.id.toLowerCase()}`}
            className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-gold)]"
          >
            <Art src={row.image_url} size={28} />
            <span className="min-w-0">{row.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Merchant({ mode, t, bp }: { mode: GameModeRow; t: T; bp: string }) {
  const entries = mode.merchant_entries ?? [];
  const rules = mode.merchant;
  return (
    <div className="mb-8">
      <h3
        id={`${modeAnchor(mode.id)}-merchant`}
        className={`${HEAD} scroll-mt-24`}
      >
        {t("Merchant offers")}
      </h3>
      {rules?.offers_shown != null && rules.picks != null && (
        <p className="mb-5 max-w-[65ch] text-base leading-relaxed text-[var(--text-primary)]">
          {t(
            "{shown} offers appear, {normal} normal and {cursed} cursed, and you may take {picks}. Nothing costs gold.",
            {
              shown: rules.offers_shown,
              normal: rules.normal_offers_shown ?? 0,
              cursed: rules.cursed_offers_shown ?? 0,
              picks: rules.picks,
            },
          )}
        </p>
      )}
      {OFFER_GROUPS.map((group) => {
        const rows = entries.filter((entry) => offerGroup(entry) === group);
        if (!rows.length) return null;
        const cursed = group === "Cursed offers";
        return (
          <div key={group} className="mb-6 last:mb-0">
            <h4
              className={`mb-1 text-sm font-semibold ${
                cursed ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"
              }`}
            >
              {t(group)}
            </h4>
            {cursed && !!rules?.curses?.length && (
              <p className={`${BODY} mb-2 max-w-[65ch]`}>
                {t("Each cursed offer also gives 1 random curse:")}{" "}
                <NamedLinks rows={rules.curses} path="cards" bp={bp} />
              </p>
            )}
            <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
              {rows.map((entry) => (
                <li
                  key={entry.id || entry.name}
                  className="flex gap-3 border-t border-[var(--border-subtle)] py-3"
                >
                  <Art src={entry.image_url} size={40} />
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {entry.name}
                      {entry.rare && (
                        <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                          {t("Half as likely to appear")}
                        </span>
                      )}
                    </div>
                    <div className={BODY}>
                      <RichDescription text={entry.description} />
                    </div>
                    {entry.id === "CARD_ENCHANT" &&
                      !!rules?.enchantments?.length && (
                        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                          {t("Enchantments the merchant can apply")}
                          {": "}
                          {rules.enchantments.map((e, i) => (
                            <span key={e.id} className="whitespace-nowrap">
                              {i > 0 && ", "}
                              <Link
                                href={`${bp}/enchantments/${e.id.toLowerCase()}`}
                                className={LINK}
                              >
                                {e.name}
                              </Link>{" "}
                              <span className="tabular-nums">{e.amount}</span>
                            </span>
                          ))}
                        </p>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function GameModesView({
  modes,
  betaIds,
}: {
  modes: GameModeRow[];
  betaIds: string[];
}) {
  const t = useT();
  const bp = useBetaPrefix();
  const beta = new Set(betaIds);
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {t("Game Modes")}
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        {t("Every way to play a run, with the rules each mode adds.")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
        {modes.map((mode) => (
          <a
            key={mode.id}
            href={`#${modeAnchor(mode.id)}`}
            className={`${PANEL} p-4 block hover:border-[var(--border-accent)] transition-colors`}
          >
            <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)] mb-1">
              {mode.name}
              {beta.has(mode.id) && <BetaBadge />}
            </span>
            {mode.description && (
              <span className="block text-sm text-[var(--text-secondary)] leading-relaxed">
                <RichDescription text={mode.description} nestedInLink />
              </span>
            )}
          </a>
        ))}
      </div>

      {modes.map((mode) => (
        <section
          key={mode.id}
          id={modeAnchor(mode.id)}
          className="mb-14 scroll-mt-24"
        >
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)] mb-3">
            {mode.name}
            {beta.has(mode.id) && <BetaBadge />}
          </h2>
          {(mode.intro || mode.description) && (
            <div className="text-[var(--text-secondary)] leading-relaxed mb-4 max-w-[70ch]">
              <RichDescription text={mode.intro || mode.description || ""} />
            </div>
          )}
          {mode.multiplayer_description && (
            <div className="text-sm text-[var(--text-muted)] leading-relaxed mb-6 max-w-[70ch]">
              <span className="font-semibold">{t("In co-op")}: </span>
              <RichDescription text={mode.multiplayer_description} />
            </div>
          )}

          {!!mode.act_rooms?.length && (
            <div className="mb-8">
              <h3 className={HEAD}>{t("Act layout")}</h3>
              <ActTrack mode={mode} t={t} />
            </div>
          )}

          {!!mode.rules?.length && (
            <div className="mb-8">
              <h3 className={HEAD}>{t("Rules")}</h3>
              <ol className="list-decimal space-y-1.5 pl-5 marker:text-[var(--text-muted)] max-w-[70ch]">
                {mode.rules.map((rule) => (
                  <li key={rule} className={BODY}>
                    <RichDescription text={rule} />
                  </li>
                ))}
              </ol>
            </div>
          )}

          {mode.unlock_info && (
            <div className="mb-8">
              <h3 className={HEAD}>{t("How to unlock")}</h3>
              <div className={`${BODY} max-w-[70ch]`}>
                <RichDescription text={mode.unlock_info} />
              </div>
              {mode.epoch_id && (
                <Link
                  href={`${bp}/timeline/${mode.epoch_id.toLowerCase()}`}
                  className={`${LINK} mt-2 inline-flex min-h-11 items-center text-sm text-[var(--accent-gold)]`}
                >
                  {t("Timeline")}
                </Link>
              )}
            </div>
          )}

          {mode.neow && (
            <div className="mb-8">
              <h3 className={HEAD}>{t("Starting choice")}</h3>
              <div className={`${BODY} max-w-[70ch]`}>
                <RichDescription text={mode.neow.description} />
              </div>
              {mode.neow_details?.cards_offered != null &&
                mode.neow_details.cards_picked != null && (
                  <p className={`${BODY} max-w-[70ch]`}>
                    {t("{offered} cards are offered and you keep {picked}.", {
                      offered: mode.neow_details.cards_offered,
                      picked: mode.neow_details.cards_picked,
                    })}
                  </p>
                )}
              {mode.neow_details?.rarity_odds && (
                <div className="mt-4">
                  <OddsRows
                    t={t}
                    rows={[
                      {
                        label: t("Starting choice"),
                        odds: mode.neow_details.rarity_odds,
                      },
                      ...(mode.merchant?.card_rarity_odds
                        ? [
                            {
                              label: t("Merchant offers"),
                              odds: mode.merchant.card_rarity_odds,
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )}
            </div>
          )}

          {!!mode.merchant_entries?.length && (
            <Merchant mode={mode} t={t} bp={bp} />
          )}

          {!!mode.ascension_ladder?.length && (
            <div className="mb-8">
              <h3 className={HEAD}>{t("Ascension levels")}</h3>
              <p className={`${BODY} mb-3 max-w-[70ch]`}>
                {t(
                  "This mode has its own Ascension ladder, shared by every character.",
                )}
              </p>
              <ol className="space-y-3">
                {mode.ascension_ladder.map((step) => (
                  <li key={step.id} className="flex gap-3 text-sm">
                    <span className="w-5 shrink-0 font-semibold text-[var(--accent-gold)] tabular-nums">
                      {step.level}
                    </span>
                    <span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {step.name}
                      </span>
                      {step.description && (
                        <span className="block text-[var(--text-secondary)] leading-relaxed">
                          <RichDescription text={step.description} />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!!mode.dominions?.length && (
            <div className="mb-8">
              <h3 className={HEAD}>
                {t("Dominions")} ({mode.dominions.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mode.dominions.map((dominion) => (
                  <div key={dominion.id} className={`${PANEL} p-4`}>
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1">
                      {dominion.encounter_id ? (
                        <Link
                          href={`${bp}/encounters/${dominion.encounter_id.toLowerCase()}`}
                          className="hover:text-[var(--accent-gold)] transition-colors"
                        >
                          {dominion.boss_name}
                        </Link>
                      ) : (
                        dominion.boss_name
                      )}
                    </h4>
                    <div className={BODY}>
                      <RichDescription text={dominion.description} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode.rotating_streak && (
            <div className="mb-8">
              <h3 className={HEAD}>{mode.rotating_streak.name}</h3>
              <div className={`${BODY} max-w-[70ch]`}>
                <RichDescription text={mode.rotating_streak.description} />
              </div>
            </div>
          )}

          {(!!mode.banned_cards?.length || !!mode.banned_relics?.length) && (
            <div className="mb-8">
              <h3 className={HEAD}>{t("Not available in this mode")}</h3>
              {!!mode.late_relics?.relics.length && (
                <div className="mb-4">
                  <p className={`${BODY} mb-1`}>
                    {t("Relics that stop appearing from floor {n}", {
                      n: mode.late_relics.from_floor,
                    })}
                  </p>
                  <RelicGrid rows={mode.late_relics.relics} bp={bp} />
                </div>
              )}
              <details className={PANEL}>
                <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-sm font-semibold text-[var(--text-primary)]">
                  {t("{relics} relics and {cards} cards never appear", {
                    relics: mode.banned_relics?.length ?? 0,
                    cards: mode.banned_cards?.length ?? 0,
                  })}
                </summary>
                <div className="space-y-4 px-4 pb-4">
                  {!!mode.banned_cards?.length && (
                    <p className={BODY}>
                      <span className="text-[var(--text-muted)]">
                        {t("Cards")}:{" "}
                      </span>
                      <NamedLinks
                        rows={mode.banned_cards}
                        path="cards"
                        bp={bp}
                      />
                    </p>
                  )}
                  {!!mode.banned_relics?.length && (
                    <RelicGrid rows={mode.banned_relics} bp={bp} />
                  )}
                </div>
              </details>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
