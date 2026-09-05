"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useAuth } from "@/app/contexts/AuthContext";
import { authHeaders } from "@/app/admin/shared";
import { t } from "@/lib/ui-translations";
import { cachedFetch } from "@/lib/fetch-cache";
import RunSummary, { type PotionInfo } from "./RunSummary";
import SimilarRuns from "./SimilarRuns";
import { CardPill, RelicPill, cleanId, displayName, type CardInfo, type RelicInfo } from "./RunPills";

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
export default function SharedRunClient({ initialRun }: { initialRun?: any }) {
  const { hash } = useParams<{ hash: string }>();
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const { user } = useAuth();
  const [run, setRun] = useState<any>(initialRun ?? null);
  const [loading, setLoading] = useState(!initialRun);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportEmail, setReportEmail] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [unhiding, setUnhiding] = useState(false);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, PotionInfo>>({});
  const [charNames, setCharNames] = useState<Record<string, string>>({});
  const [encounterNames, setEncounterNames] = useState<Record<string, string>>({});
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!hash) return;
    // Server already delivered the run; no need to refetch it client-side.
    if (!initialRun) {
      fetch(`${API}/api/runs/shared/${hash}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setRun)
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
    }

    cachedFetch<CardInfo[]>(`${API}/api/cards?lang=${lang}`).then((cards) => {
      const m: Record<string, CardInfo> = {};
      for (const c of cards) m[c.id] = c;
      setCardData(m);
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`).then((relics) => {
      const m: Record<string, RelicInfo> = {};
      for (const r of relics) m[r.id] = r;
      setRelicData(m);
    });
    cachedFetch<PotionInfo[]>(`${API}/api/potions?lang=${lang}`).then((potions) => {
      const m: Record<string, PotionInfo> = {};
      for (const p of potions) m[p.id] = p;
      setPotionData(m);
    });
    // Localized character names so the header reads "戦士" etc. instead of
    // the displayName(id) English derivation.
    cachedFetch<{ id: string; name: string }[]>(`${API}/api/characters?lang=${lang}`).then((chars) => {
      const m: Record<string, string> = {};
      for (const c of chars) m[c.id.toUpperCase()] = c.name;
      setCharNames(m);
    });
    // Localized encounter names so "Killed by …" shows the locale's name.
    cachedFetch<{ id: string; name: string }[]>(`${API}/api/encounters?lang=${lang}`).then((encs) => {
      const m: Record<string, string> = {};
      for (const e of encs) m[e.id.toUpperCase()] = e.name;
      setEncounterNames(m);
    });
  }, [hash, lang]);

  // Beta-build runs reference cards/relics/potions that only exist in the beta
  // data tree. Merge the beta catalog over the main maps so those resolve (name
  // + image); main wins for shared ids, and entities in neither channel still
  // show nothing. is_beta is flagged server-side from the run's build_id.
  useEffect(() => {
    if (!run?.is_beta) return;
    let cancelled = false;
    cachedFetch<CardInfo[]>(`${API}/api/cards?lang=${lang}&channel=beta`).then((cards) => {
      if (cancelled) return;
      setCardData((prev) => {
        const m = { ...prev };
        for (const c of cards) if (!(c.id in m)) m[c.id] = c;
        return m;
      });
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}&channel=beta`).then((relics) => {
      if (cancelled) return;
      setRelicData((prev) => {
        const m = { ...prev };
        for (const r of relics) if (!(r.id in m)) m[r.id] = r;
        return m;
      });
    });
    cachedFetch<PotionInfo[]>(`${API}/api/potions?lang=${lang}&channel=beta`).then((potions) => {
      if (cancelled) return;
      setPotionData((prev) => {
        const m = { ...prev };
        for (const p of potions) if (!(p.id in m)) m[p.id] = p;
        return m;
      });
    });
    cachedFetch<{ id: string; name: string }[]>(
      `${API}/api/encounters?lang=${lang}&channel=beta`,
    ).then((encs) => {
      if (cancelled) return;
      setEncounterNames((prev) => {
        const m = { ...prev };
        for (const e of encs) {
          const k = e.id.toUpperCase();
          if (!(k in m)) m[k] = e.name;
        }
        return m;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [run?.is_beta, lang]);

  function localizedCharName(id: string): string {
    const key = cleanId(id).toUpperCase();
    return charNames[key] ?? displayName(id);
  }
  function localizedEncounterName(id: string): string {
    const key = cleanId(id).toUpperCase();
    return encounterNames[key] ?? displayName(id);
  }

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
      body: JSON.stringify({ run_hash: hash, email: reportEmail.trim(), reason: reportReason.trim() }),
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

  function unhideRun() {
    setUnhiding(true);
    fetch(`${API}/api/admin/runs/${hash}/hide`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ hidden: false }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        setRun({ ...run, hidden: false });
      })
      .catch(() => {})
      .finally(() => setUnhiding(false));
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">{t("Loading...", lang)}</div>;
  if (notFound || !run) return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <p className="text-[var(--text-muted)] mb-4">{t("Run not found.", lang)}</p>
      <Link href={`${lp}/leaderboards`} className="text-[var(--accent-gold)] hover:underline">&larr; {t("Back to", lang)}</Link>
    </div>
  );

  // Co-op siblings all serve the same blob; player_index says which
  // players[] entry the viewed hash belongs to (0 = host / single-player).
  const player = run.players[run.player_index ?? 0] ?? run.players[0];
  const charId = cleanId(player.character);
  const charColor = CHAR_CSS_VAR[charId.toUpperCase()] || "var(--accent-gold)";
  const totalFloors = run.map_point_history?.reduce((sum: number, act: any[]) => sum + act.length, 0) || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href={`${lp}/leaderboards`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          &larr; {t("Back to", lang)}
        </Link>
        <div className="flex items-center gap-2">
          {run.has_replay && (
            <Link href={`/runs/${hash}/replay`}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent-gold)] text-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-[var(--bg-primary)] transition-colors font-semibold">
              {t("Replay", lang)}
            </Link>
          )}
          {run.hidden && user?.is_admin && (
            <button onClick={unhideRun} disabled={unhiding}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent-gold)]/40 text-[var(--accent-gold)] hover:border-[var(--accent-gold)] transition-colors disabled:opacity-50">
              {unhiding ? "..." : "Unhide"}
            </button>
          )}
          <button onClick={() => setShowReport(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors">
            {t("Report", lang)}
          </button>
          <button onClick={copyLink}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors">
            {copied ? t("Copied!", lang) : t("Share", lang)}
          </button>
        </div>
      </div>
      {showReport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => reportState !== "sending" && setShowReport(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">{t("Report run", lang)}</h2>
            {reportState === "sent" ? (
              <p className="text-sm text-[var(--color-silent)] py-4">{t("Report sent. Thanks!", lang)}</p>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-[var(--text-muted)]">{t("Why are you reporting this run?", lang)}</span>
                  <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)}
                    rows={4} maxLength={2000}
                    className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-accent)] focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--text-muted)]">{t("Email", lang)}</span>
                  <input type="email" value={reportEmail} onChange={(e) => setReportEmail(e.target.value)}
                    required maxLength={254}
                    className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-accent)] focus:outline-none" />
                  {reportEmail.trim() !== "" && !emailOk && (
                    <span className="text-xs text-[var(--color-ironclad)]">{t("Enter a valid email address.", lang)}</span>
                  )}
                </label>
                {reportState === "error" && (
                  <p className="text-xs text-[var(--color-ironclad)]">{reportError || t("Could not send the report.", lang)}</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setShowReport(false)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                    {t("Cancel", lang)}
                  </button>
                  <button onClick={submitReport} disabled={reportState === "sending" || !emailOk || !reportReason.trim()}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] hover:border-[var(--accent-gold)] transition-colors disabled:opacity-50">
                    {reportState === "sending" ? "..." : t("Send report", lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {run.hidden && (
        <div className="mb-4 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
          {t("This run doesn't count toward leaderboards or community stats.", lang)}{" "}
          <a
            href="https://discord.gg/xMsTBeh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline"
          >
            {t("Reach out on Discord if that seems wrong.", lang)}
          </a>
        </div>
      )}

      {/* Compact header, Victory/Defeat banner + ascension */}
      <div
        className="rounded-xl border px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-2"
        style={{ borderColor: `color-mix(in srgb, ${charColor} 40%, transparent)`, background: `color-mix(in srgb, ${charColor} 8%, var(--bg-card))` }}
      >
        {/* h1 on purpose: this line is the page's one heading, and run pages
            audited as headingless before it. */}
        <h1 className="flex items-center gap-3 text-xl font-bold">
          <span
            style={{ color: run.win ? "var(--color-silent)" : run.was_abandoned ? "var(--text-muted)" : "var(--color-ironclad)" }}
          >
            {run.win ? t("Victory", lang) : run.was_abandoned ? t("Abandoned", lang) : t("Defeat", lang)}
          </span>
          <Link href={`${lp}/characters/${charId.toLowerCase()}`} className="text-base font-normal hover:underline" style={{ color: charColor }}>
            {localizedCharName(player.character)}
          </Link>
        </h1>
        <div className="text-sm text-[var(--text-muted)]">
          {t("Ascension", lang)} {run.ascension || 0}
          {!run.win && !run.was_abandoned && run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE" && (
            <>
              {" · "}{t("Killed by", lang)}{" "}
              <Link href={`${lp}/encounters/${cleanId(run.killed_by_encounter).toLowerCase()}`} className="hover:underline" style={{ color: "var(--color-ironclad)" }}>
                {localizedEncounterName(run.killed_by_encounter)}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* In-game-style run summary */}
      <RunSummary
        run={run}
        player={player}
        cardData={cardData}
        relicData={relicData}
        potionData={potionData}
        charColor={charColor}
        langPrefix={lp}
      />

      {/* Detailed history toggle */}
      <button
        onClick={() => setShowDetails((v) => !v)}
        className="w-full text-left text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-3 flex items-center gap-2"
      >
        <span className={`inline-block transition-transform ${showDetails ? "rotate-90" : ""}`}>&gt;</span>
        {showDetails ? t("Hide", lang) : t("Show", lang)} {t("detailed history", lang)}
      </button>

      {showDetails && <>
      {/* Deck */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{t("Final Deck", lang)} ({player.deck.length})</h2>
        <div className="flex flex-wrap gap-1.5">
          {player.deck.sort((a: any, b: any) => cleanId(a.id).localeCompare(cleanId(b.id))).map((card: any, i: number) => {
            const cid = cleanId(card.id);
            return (
              <CardPill key={`${cid}-${i}`} cardId={cid} upgraded={!!card.current_upgrade_level}
                enchantment={card.enchantment ? cleanId(card.enchantment.id) : undefined}
                cardData={cardData} lp={lp}
                className={`text-xs px-2 py-1 rounded border transition-colors hover:bg-[var(--bg-card-hover)] ${
                  card.current_upgrade_level
                    ? "border-[var(--color-silent)]/30 bg-[var(--color-silent)]/10 text-[var(--color-silent)]"
                    : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`} />
            );
          })}
        </div>
      </div>

      {/* Relics */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{t("Relics", lang)} ({player.relics.length})</h2>
        <div className="flex flex-wrap gap-1.5">
          {player.relics.map((relic: any, i: number) => {
            const rid = cleanId(relic.id);
            return (
              <RelicPill key={`${rid}-${i}`} relicId={rid} relicData={relicData} lp={lp}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-gold)] hover:bg-[var(--bg-card-hover)] transition-colors">
                {displayName(relic.id)}
                <span className="text-[var(--text-muted)] ml-1">F{relic.floor_added_to_deck}</span>
              </RelicPill>
            );
          })}
        </div>
      </div>

      {/* Floor History */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{t("Floor History", lang)}</h2>
        <div className="space-y-1">
          {run.map_point_history?.map((actFloors: any[], actIdx: number) => (
            <div key={actIdx}>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-3 mb-1.5">
                {displayName(run.acts?.[actIdx] || `Act ${actIdx + 1}`)}
              </h3>
              {actFloors.map((floor: any, floorIdx: number) => {
                const ps = floor.player_stats?.[0];
                const room = floor.rooms?.[0];
                const encounter = room?.model_id ? displayName(room.model_id) : floor.map_point_type;
                const roomColors: Record<string, string> = {
                  monster: "var(--text-secondary)", elite: "var(--accent-gold)", boss: "var(--color-ironclad)",
                  rest: "var(--color-silent)", shop: "var(--accent-teal)", event: "var(--color-necrobinder)", treasure: "var(--accent-gold)",
                };
                const picked = ps?.card_choices?.filter((c: any) => c.was_picked).map((c: any) => displayName(c.card.id)) || [];
                const skipped = ps?.card_choices?.filter((c: any) => !c.was_picked).map((c: any) => displayName(c.card.id)) || [];
                return (
                  <div key={floorIdx} className="flex items-start gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0 text-xs">
                    <span className="text-[var(--text-muted)] w-6 text-right flex-shrink-0">{floorIdx + 1}</span>
                    <span className="w-14 flex-shrink-0 font-medium" style={{ color: roomColors[floor.map_point_type] || "var(--text-secondary)" }}>
                      {floor.map_point_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--text-secondary)]">{encounter}</span>
                      {room?.turns_taken != null && <span className="text-[var(--text-muted)] ml-1">({room.turns_taken}T)</span>}
                      {picked.length > 0 && <span className="ml-2" style={{ color: "var(--color-silent)" }}>+{picked.join(", ")}</span>}
                      {skipped.length > 0 && <span className="text-[var(--text-muted)] ml-1 line-through">{skipped.join(", ")}</span>}
                    </div>
                    {ps && (
                      <div className="flex items-center gap-2 flex-shrink-0 text-[var(--text-muted)]">
                        {ps.damage_taken > 0 && <span style={{ color: "var(--color-ironclad)" }}>-{ps.damage_taken}</span>}
                        {ps.hp_healed > 0 && <span style={{ color: "var(--color-silent)" }}>+{ps.hp_healed}</span>}
                        <span>{ps.current_hp}/{ps.max_hp}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <SimilarRuns hash={hash} />
      </>}
    </div>
  );
}
