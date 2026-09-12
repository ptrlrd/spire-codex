"use client";

import { useT, useGameLocale, useTryGameTranslations } from "@/lib/i18n";
import { useContext, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import { useAuth } from "@/app/contexts/AuthContext";
import { useToast } from "@/app/components/Toast";
import { authHeaders } from "@/app/[locale]/admin/shared";
import RunSummary from "./RunSummary";
import SimilarRuns from "./SimilarRuns";
import { CardPill, RelicPill } from "./RunPills";
import { ApiConfigContext } from "@/app/contexts/ApiConfigContext";
import CardsContext, { useCards } from "@/app/contexts/api/Cards";
import PotionsContext, { usePotions } from "@/app/contexts/api/Potions";
import RelicsContext, { useRelics } from "@/app/contexts/api/Relics";
import SharedRunContext from "@/app/contexts/api/run/SharedRun";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHAR_CSS_VAR: Record<string, string> = {
  IRONCLAD: "var(--color-ironclad)",
  SILENT: "var(--color-silent)",
  DEFECT: "var(--color-defect)",
  NECROBINDER: "var(--color-necrobinder)",
  REGENT: "var(--color-regent)",
};

// `initialRun` is the server-fetched run from page.tsx. With it, the whole
// page server-renders with real data — before, the body was an empty shell
// until the client refetched the same endpoint, so every run page looked
// identical to crawlers (duplicate content) and carried no unique text.
export default function SharedRunClient() {
  const { hash } = useParams<{ hash: string }>();
  const bp = useBetaPrefix();
  const lang = useGameLocale();
  const t = useT();
  const tryGT = useTryGameTranslations();
  const { user } = useAuth();
  const { toast } = useToast();
  const run = useContext(SharedRunContext);
  const [hidden, setHidden] = useState<boolean>(false);
  const loading = !run;
  const [copied, setCopied] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportEmail, setReportEmail] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportState, setReportState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [unhiding, setUnhiding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const apiConfig = { beta: run?.is_beta ?? false };
  const cards = useCards(apiConfig);
  const relics = useRelics(apiConfig);
  const potions = usePotions(apiConfig);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(reportEmail.trim());

  function submitReport() {
    if (!emailOk || !reportReason.trim()) return;
    setReportState("sending");
    setReportError(null);
    fetch(`${API}/api/feedback/run-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_hash: hash,
        email: reportEmail.trim(),
        reason: reportReason.trim(),
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.detail || `${r.status}`);
        }
        setReportState("sent");
        setTimeout(() => {
          setShowReport(false);
          setReportState("idle");
          setReportReason("");
          setReportEmail("");
        }, 1800);
      })
      .catch((e) => {
        setReportState("error");
        setReportError(String((e as Error)?.message || e));
      });
  }

  function toggleHidden() {
    setUnhiding(true);
    const newValue = !hidden;
    fetch(`${API}/api/admin/runs/${hash}/hide`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ hidden: newValue }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        setHidden(newValue);
        toast(newValue ? t("Run hidden") : t("Run unhidden"), "success");
      })
      .catch(() => toast(t("Failed to update this run"), "error"))
      .finally(() => setUnhiding(false));
  }

  if (loading)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        {t("Loading...")}
      </div>
    );
  if (!run)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Run not found.")}</p>
        <Link
          href={`${bp}/leaderboards`}
          className="text-[var(--accent-gold)] hover:underline"
        >
          &larr; {t("Back to")}
        </Link>
      </div>
    );

  // Co-op siblings all serve the same blob; player_index says which
  // players[] entry the viewed hash belongs to (0 = host / single-player).
  const player = run.players[run.player_index ?? 0] ?? run.players[0];
  const charId = player.character;
  const charColor = CHAR_CSS_VAR[charId.toUpperCase()] || "var(--accent-gold)";
  const totalFloors = run.floor_history.reduce(
    (sum, act) => sum + act.length,
    0,
  );

  return (
    cards &&
    potions &&
    relics && (
      <ApiConfigContext value={{ beta: run.is_beta }}>
        <CardsContext value={cards}>
          <RelicsContext value={relics}>
            <PotionsContext value={potions}>
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-between mb-4">
                  <Link
                    href={`${bp}/leaderboards`}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    &larr; {t("Back to")}
                  </Link>
                  <div className="flex items-center gap-2">
                    {user?.is_admin && (
                      <button
                        onClick={toggleHidden}
                        disabled={unhiding}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent-gold)]/40 text-[var(--accent-gold)] hover:border-[var(--accent-gold)] transition-colors disabled:opacity-50"
                      >
                        {unhiding ? "..." : hidden ? t("Unhide") : t("Hide")}
                      </button>
                    )}
                    <button
                      onClick={() => setShowReport(true)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
                    >
                      {t("Report")}
                    </button>
                    <button
                      onClick={copyLink}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
                    >
                      {copied ? t("Copied!") : t("Share")}
                    </button>
                  </div>
                </div>
                {showReport && (
                  <div
                    className="fixed inset-0 z-50 bg-scrim/60 flex items-center justify-center p-4"
                    onClick={() =>
                      reportState !== "sending" && setShowReport(false)
                    }
                  >
                    <div
                      className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5 w-full max-w-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">
                        {t("Report run")}
                      </h2>
                      {reportState === "sent" ? (
                        <p className="text-sm text-[var(--color-silent)] py-4">
                          {t("Report sent. Thanks!")}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <label className="block">
                            <span className="text-xs text-[var(--text-muted)]">
                              {t("Why are you reporting this run?")}
                            </span>
                            <textarea
                              value={reportReason}
                              onChange={(e) => setReportReason(e.target.value)}
                              rows={4}
                              maxLength={2000}
                              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-accent)] focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs text-[var(--text-muted)]">
                              {t("Email")}
                            </span>
                            <input
                              type="email"
                              value={reportEmail}
                              onChange={(e) => setReportEmail(e.target.value)}
                              required
                              maxLength={254}
                              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-accent)] focus:outline-none"
                            />
                            {reportEmail.trim() !== "" && !emailOk && (
                              <span className="text-xs text-[var(--color-ironclad)]">
                                {t("Enter a valid email address.")}
                              </span>
                            )}
                          </label>
                          {reportState === "error" && (
                            <p className="text-xs text-[var(--color-ironclad)]">
                              {reportError || t("Could not send the report.")}
                            </p>
                          )}
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setShowReport(false)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              {t("Cancel")}
                            </button>
                            <button
                              onClick={submitReport}
                              disabled={
                                reportState === "sending" ||
                                !emailOk ||
                                !reportReason.trim()
                              }
                              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] hover:border-[var(--accent-gold)] transition-colors disabled:opacity-50"
                            >
                              {reportState === "sending"
                                ? "..."
                                : t("Send report")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {hidden && (
                  <div className="mb-4 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {t(
                      "This run doesn't count toward leaderboards or community stats.",
                    )}{" "}
                    <a
                      href="https://discord.gg/xMsTBeh"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-gold)] hover:underline"
                    >
                      {t("Reach out on Discord if that seems wrong.")}
                    </a>
                  </div>
                )}

                {/* Compact header, Victory/Defeat banner + ascension */}
                <div
                  className="rounded-xl border px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-2"
                  style={{
                    borderColor: `color-mix(in srgb, ${charColor} 40%, transparent)`,
                    background: `color-mix(in srgb, ${charColor} 8%, var(--bg-card))`,
                  }}
                >
                  {/* h1 on purpose: this line is the page's one heading, and run pages
            audited as headingless before it. */}
                  <h1 className="flex items-center gap-3 text-xl font-bold">
                    <span
                      style={{
                        color: run.win
                          ? "var(--color-silent)"
                          : run.was_abandoned
                            ? "var(--text-muted)"
                            : "var(--color-ironclad)",
                      }}
                    >
                      {run.win
                        ? t("Victory")
                        : run.was_abandoned
                          ? t("Abandoned")
                          : t("Defeat")}
                    </span>
                    <Link
                      href={`${bp}/characters/${charId.toLowerCase()}`}
                      className="text-base font-normal hover:underline"
                      style={{ color: charColor }}
                    >
                      {tryGT(`characters.${player.character}.name`) ??
                        tryGT("characters.LOCKED.title") ??
                        t("Unknown")}
                    </Link>
                  </h1>
                  <div className="text-sm text-[var(--text-muted)]">
                    {t("Ascension")} {run.ascension || 0}
                    {!run.win &&
                      !run.was_abandoned &&
                      run.killed_by_encounter &&
                      run.killed_by_encounter !== "NONE.NONE" && (
                        <>
                          {" · "}
                          {t("Killed by")}{" "}
                          <Link
                            href={`${bp}/encounters/${run.killed_by_encounter.toLowerCase()}`}
                            className="hover:underline"
                            style={{ color: "var(--color-ironclad)" }}
                          >
                            {tryGT(
                              `encounters.${run.killed_by_encounter}.title`,
                            )}
                          </Link>
                        </>
                      )}
                  </div>
                </div>

                {/* In-game-style run summary */}
                <RunSummary
                  run={run}
                  player={player}
                  charColor={charColor}
                  langPrefix={bp}
                />

                {/* Detailed history toggle */}
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="w-full text-left text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-3 flex items-center gap-2"
                >
                  <span
                    className={`inline-block transition-transform ${showDetails ? "rotate-90" : ""}`}
                  >
                    &gt;
                  </span>
                  {showDetails ? t("Hide") : t("Show")} {t("detailed history")}
                </button>

                {showDetails && (
                  <>
                    {/* Deck */}
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                        {t("Final Deck")} ({player.deck.length})
                      </h2>
                      <div className="flex flex-wrap gap-1.5">
                        {player.deck
                          .sort((a, b) => a.id.localeCompare(b.id))
                          .map((card, i) => {
                            return (
                              <CardPill
                                key={`${card.id}-${i}`}
                                cardId={card.id}
                                upgraded={!!card.current_upgrade_level}
                                enchantment={card.enchantment?.id}
                                bp={bp}
                                className={`text-xs px-2 py-1 rounded border transition-colors hover:bg-[var(--bg-card-hover)] ${
                                  card.current_upgrade_level
                                    ? "border-[var(--color-silent)]/30 bg-[var(--color-silent)]/10 text-[var(--color-silent)]"
                                    : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                }`}
                              />
                            );
                          })}
                      </div>
                    </div>

                    {/* Relics */}
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                        {t("Relics")} ({player.relics.length})
                      </h2>
                      <div className="flex flex-wrap gap-1.5">
                        {player.relics.map((relic, i) => {
                          return (
                            <RelicPill
                              key={`${relic.id}-${i}`}
                              relicId={relic.id}
                              bp={bp}
                              className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-gold)] hover:bg-[var(--bg-card-hover)] transition-colors"
                            >
                              {tryGT(`relics.${relic.id}.title`) ?? relic.id}
                              <span className="text-[var(--text-muted)] ml-1">
                                F{relic.floor_added_to_deck}
                              </span>
                            </RelicPill>
                          );
                        })}
                      </div>
                    </div>

                    {/* Floor History */}
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                        {t("Floor History")}
                      </h2>
                      <div className="space-y-1">
                        {run.floor_history?.map((actFloors, actIdx) => {
                          const actId = run.acts?.[actIdx];
                          const actName =
                            (actId
                              ? tryGT(`acts.${actId}.title`)
                              : undefined) ?? t("Act {n}", { n: actIdx + 1 });
                          return (
                            <div key={actIdx}>
                              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-3 mb-1.5">
                                {actName}
                              </h3>
                              {actFloors.map((floor, floorIdx) => {
                                const ps = floor.player_stats[0];
                                const room = floor.rooms[0];

                                const encounterName = roomT(room ?? {});

                                const roomColors: Record<string, string> = {
                                  monster: "var(--text-secondary)",
                                  elite: "var(--accent-gold)",
                                  boss: "var(--color-ironclad)",
                                  rest: "var(--color-silent)",
                                  shop: "var(--accent-teal)",
                                  event: "var(--color-necrobinder)",
                                  treasure: "var(--accent-gold)",
                                };
                                const picked =
                                  ps?.card_choices
                                    ?.filter(({ was_picked }) => was_picked)
                                    .map(
                                      ({ card: { id } }) =>
                                        tryGT(`cards.${id}.name`) ?? c.id,
                                    ) || [];
                                const skipped =
                                  ps?.card_choices
                                    ?.filter(({ was_picked }) => !was_picked)
                                    .map(
                                      ({ card: { id } }) =>
                                        tryGT(`cards.${id}.name`) ?? id,
                                    ) || [];
                                return (
                                  <div
                                    key={floorIdx}
                                    className="flex items-start gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0 text-xs"
                                  >
                                    <span className="text-[var(--text-muted)] w-6 text-right flex-shrink-0">
                                      {floorIdx + 1}
                                    </span>
                                    <span
                                      className="w-14 flex-shrink-0 font-medium"
                                      style={{
                                        color:
                                          roomColors[floor.raw_type] ||
                                          "var(--text-secondary)",
                                      }}
                                    >
                                      {floor.floor_type
                                        ? (tryGT(
                                            `static_hover_tooltips.ROOM_${floor.was_unknown ? "UNKNOWN_" : ""}${floor.floor_type}.title`,
                                          ) ?? t("map.LEGEND_UNKNOWN.title"))
                                        : floor.raw_type}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-[var(--text-secondary)]">
                                        {encounterName}
                                      </span>

                                      {
                                        //todo: localise this properly instead of just T?
                                        "type" in room &&
                                          room.type === "ENCOUNTER" && (
                                            <span className="text-[var(--text-muted)] ml-1">
                                              ({room.turns_taken}T)
                                            </span>
                                          )
                                      }
                                      {picked.length > 0 && (
                                        <span
                                          className="ml-2"
                                          style={{
                                            color: "var(--color-silent)",
                                          }}
                                        >
                                          +{picked.join(", ")}
                                        </span>
                                      )}
                                      {skipped.length > 0 && (
                                        <span className="text-[var(--text-muted)] ml-1 line-through">
                                          {skipped.join(", ")}
                                        </span>
                                      )}
                                    </div>
                                    {ps && (
                                      <div className="flex items-center gap-2 flex-shrink-0 text-[var(--text-muted)]">
                                        {(ps.damage_taken ?? 0) > 0 && (
                                          <span
                                            style={{
                                              color: "var(--color-ironclad)",
                                            }}
                                          >
                                            -{ps.damage_taken}
                                          </span>
                                        )}
                                        {(ps.hp_healed ?? 0) > 0 && (
                                          <span
                                            style={{
                                              color: "var(--color-silent)",
                                            }}
                                          >
                                            +{ps.hp_healed}
                                          </span>
                                        )}
                                        <span>
                                          {ps.current_hp}/{ps.max_hp}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <SimilarRuns hash={hash} />
                  </>
                )}
              </div>
            </PotionsContext>
          </RelicsContext>
        </CardsContext>
      </ApiConfigContext>
    )
  );
}
