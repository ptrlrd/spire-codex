"use client";

import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import BetaBadge from "@/app/components/BetaBadge";
import RichDescription from "@/app/components/RichDescription";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { modeAnchor, type GameModeRow } from "@/lib/game-mode-rows";

const CARD =
  "bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4";
const SUBHEAD =
  "text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3";

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

          {mode.neow && (
            <div className="mb-6">
              <h3 className={SUBHEAD}>{t("Starting choice")}</h3>
              <div className={CARD}>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  <RichDescription text={mode.neow.description} />
                </div>
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mode.merchant_entries.map((entry) => (
                  <div key={entry.id || entry.name} className={CARD}>
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1">
                      {entry.name}
                    </h4>
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      <RichDescription text={entry.description} />
                    </div>
                  </div>
                ))}
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
