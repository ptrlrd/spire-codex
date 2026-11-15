"use client";

import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import BetaBadge from "@/app/components/BetaBadge";
import RichDescription from "@/app/components/RichDescription";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import {
  modeAnchor,
  type GameModeRow,
  type RarityOdds,
} from "@/lib/game-mode-rows";

const CARD =
  "bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4";
const SUBHEAD =
  "text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3";

const CHIP =
  "inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)]";
const BADGE =
  "rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const RARITIES = ["Common", "Uncommon", "Rare"] as const;

function OddsChips({
  odds,
  t,
}: {
  odds: RarityOdds;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-[var(--text-muted)]">
        {t("Card rarity odds")}
      </span>
      {RARITIES.map((rarity) => (
        <span key={rarity} className={CHIP}>
          {t(rarity)}{" "}
          <span className="font-semibold text-[var(--text-primary)] tabular-nums">
            {Math.round(odds[rarity.toLowerCase() as keyof RarityOdds] * 100)}%
          </span>
        </span>
      ))}
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
            className={`${CARD} block hover:border-[var(--border-accent)] transition-colors`}
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
          className="mb-10 scroll-mt-24"
        >
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)] mb-3">
            {mode.name}
            {beta.has(mode.id) && <BetaBadge />}
          </h2>
          {(mode.intro || mode.description) && (
            <div className="text-[var(--text-secondary)] leading-relaxed mb-4">
              <RichDescription text={mode.intro || mode.description || ""} />
            </div>
          )}
          {mode.multiplayer_description && (
            <div className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">
              <span className="font-semibold">{t("In co-op")}: </span>
              <RichDescription text={mode.multiplayer_description} />
            </div>
          )}

          {!!mode.rules?.length && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("Rules")}</h3>
              <ol className={`${CARD} space-y-2 list-decimal list-inside`}>
                {mode.rules.map((rule) => (
                  <li
                    key={rule}
                    className="text-sm text-[var(--text-secondary)] leading-relaxed"
                  >
                    <RichDescription text={rule} />
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!!mode.act_rooms?.length && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("Act layout")}</h3>
              <div className={CARD}>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
                  {t(
                    "Every act is the same {n} floors in this order, with no branching paths.",
                    { n: mode.floors_per_act ?? mode.act_rooms.length },
                  )}
                </p>
                <ol className="flex flex-wrap gap-1.5">
                  {mode.act_rooms.map((room, i) => (
                    <li key={i} className={CHIP}>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {room.name}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {mode.neow && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("Starting choice")}</h3>
              <div className={`${CARD} space-y-3`}>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  <RichDescription text={mode.neow.description} />
                </div>
                {mode.neow_details?.cards_offered != null &&
                  mode.neow_details.cards_picked != null && (
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {t("{offered} cards are offered and you keep {picked}.", {
                        offered: mode.neow_details.cards_offered,
                        picked: mode.neow_details.cards_picked,
                      })}
                    </p>
                  )}
                {mode.neow_details?.rarity_odds && (
                  <OddsChips odds={mode.neow_details.rarity_odds} t={t} />
                )}
              </div>
            </div>
          )}

          {!!mode.rewards?.length && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("Rewards by room")}</h3>
              <div className={`${CARD} space-y-3`}>
                <ul className="space-y-2">
                  {mode.rewards.map((reward) => (
                    <li
                      key={reward.room}
                      className="flex flex-wrap items-center gap-1.5 text-sm"
                    >
                      <span className="w-20 font-semibold text-[var(--text-primary)]">
                        {reward.room_name}
                      </span>
                      <span className={CHIP}>
                        {t(reward.card_rarity)}:{" "}
                        {t("Choose 1 of {n} cards", {
                          n: reward.card_choices ?? 3,
                        })}
                      </span>
                      {reward.relics > 0 && (
                        <span className={CHIP}>
                          {t("{n} relics", { n: reward.relics })}
                        </span>
                      )}
                      {reward.potion && (
                        <span className={CHIP}>
                          {reward.potion === "always"
                            ? t("Potion")
                            : t(
                                "Potion, except after the first fight of the act",
                              )}
                        </span>
                      )}
                      {reward.final_boss === false && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {t("No reward after the final boss")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {!!mode.reward_upgrades_by_act?.length && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      {t("Card choices that come upgraded")}
                    </span>
                    {mode.reward_upgrades_by_act.map((count, i) => (
                      <span key={i} className={CHIP}>
                        {t("Act {n}", { n: i + 1 })}{" "}
                        <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                          {count}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {mode.treasure_extra_relics && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      {t("Extra relics in each chest")}
                    </span>
                    <span className={CHIP}>
                      {t("Solo")}{" "}
                      <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                        {mode.treasure_extra_relics.singleplayer}
                      </span>
                    </span>
                    <span className={CHIP}>
                      {t("Co-op")}{" "}
                      <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                        {mode.treasure_extra_relics.multiplayer}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!!mode.ascension_ladder?.length && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>
                {t("Ascension levels")} ({mode.ascension_ladder.length})
              </h3>
              <ol className={`${CARD} space-y-2`}>
                {mode.ascension_ladder.map((step) => (
                  <li key={step.id} className="flex gap-3 text-sm">
                    <span className="w-6 shrink-0 font-semibold text-[var(--accent-gold)] tabular-nums">
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
            <div className="mb-6">
              <h3 className={SUBHEAD}>
                {t("Dominions")} ({mode.dominions.length})
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                {t(
                  "Enemies gain an extra rule from the boss waiting at the end of the act.",
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mode.dominions.map((dominion) => (
                  <div key={dominion.id} className={CARD}>
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
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      <RichDescription text={dominion.description} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode.rotating_streak && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{mode.rotating_streak.name}</h3>
              <div className={CARD}>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  <RichDescription text={mode.rotating_streak.description} />
                </div>
              </div>
            </div>
          )}

          {!!mode.merchant_entries?.length && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>
                {t("Merchant offers")} ({mode.merchant_entries.length})
              </h3>
              {mode.merchant && (
                <div className={`${CARD} space-y-3 mb-3`}>
                  {mode.merchant.offers_shown != null &&
                    mode.merchant.picks != null && (
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {t(
                          "{shown} offers appear, {normal} normal and {cursed} cursed, and you may take {picks}. Nothing costs gold.",
                          {
                            shown: mode.merchant.offers_shown,
                            normal: mode.merchant.normal_offers_shown ?? 0,
                            cursed: mode.merchant.cursed_offers_shown ?? 0,
                            picks: mode.merchant.picks,
                          },
                        )}
                      </p>
                    )}
                  {mode.merchant.card_rarity_odds && (
                    <OddsChips odds={mode.merchant.card_rarity_odds} t={t} />
                  )}
                  {!!mode.merchant.enchantments?.length && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[var(--text-muted)]">
                        {t("Enchantments the merchant can apply")}
                      </span>
                      {mode.merchant.enchantments.map((e) => (
                        <Link
                          key={e.id}
                          href={`${bp}/enchantments/${e.id.toLowerCase()}`}
                          className={`${CHIP} hover:border-[var(--border-accent)]`}
                        >
                          {e.name}{" "}
                          <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                            {e.amount}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mode.merchant_entries.map((entry) => (
                  <div key={entry.id || entry.name} className={CARD}>
                    <h4 className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text-primary)] mb-1">
                      {entry.name}
                      {entry.cursed && (
                        <span className={BADGE}>{t("Cursed")}</span>
                      )}
                      {entry.rare && (
                        <span className={BADGE}>
                          {t("Appears half as often")}
                        </span>
                      )}
                    </h4>
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      <RichDescription text={entry.description} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!!mode.banned_cards?.length || !!mode.banned_relics?.length) && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("Not available in this mode")}</h3>
              <div className={`${CARD} space-y-3`}>
                {(
                  [
                    ["Cards", "cards", mode.banned_cards],
                    ["Relics", "relics", mode.banned_relics],
                  ] as const
                ).map(
                  ([label, path, rows]) =>
                    !!rows?.length && (
                      <div key={path}>
                        <div className="text-xs text-[var(--text-muted)] mb-1.5">
                          {t(label)} ({rows.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {rows.map((row) => (
                            <Link
                              key={row.id}
                              href={`${bp}/${path}/${row.id.toLowerCase()}`}
                              className={`${CHIP} hover:border-[var(--border-accent)]`}
                            >
                              {row.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ),
                )}
              </div>
            </div>
          )}

          {mode.unlock_info && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("How to unlock")}</h3>
              <div className={CARD}>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  <RichDescription text={mode.unlock_info} />
                </div>
                {mode.epoch_id && (
                  <Link
                    href={`${bp}/timeline/${mode.epoch_id.toLowerCase()}`}
                    className="inline-block mt-2 text-sm text-[var(--accent-gold)] hover:underline"
                  >
                    {t("Timeline")} →
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
