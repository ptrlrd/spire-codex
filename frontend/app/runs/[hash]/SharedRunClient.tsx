"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { cachedFetch } from "@/lib/fetch-cache";
import RunSummary, { type PotionInfo } from "./RunSummary";
import { CardPill, RelicPill, cleanId, displayName, type CardInfo, type RelicInfo } from "./RunPills";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHAR_CSS_VAR: Record<string, string> = {
  IRONCLAD: "var(--color-ironclad)",
  SILENT: "var(--color-silent)",
  DEFECT: "var(--color-defect)",
  NECROBINDER: "var(--color-necrobinder)",
  REGENT: "var(--color-regent)",
};

export default function SharedRunClient() {
  const { hash } = useParams<{ hash: string }>();
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, PotionInfo>>({});
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!hash) return;
    fetch(`${API}/api/runs/shared/${hash}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setRun)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));

    cachedFetch<CardInfo[]>(`${API}/api/cards`).then((cards) => {
      const m: Record<string, CardInfo> = {};
      for (const c of cards) m[c.id] = c;
      setCardData(m);
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics`).then((relics) => {
      const m: Record<string, RelicInfo> = {};
      for (const r of relics) m[r.id] = r;
      setRelicData(m);
    });
    cachedFetch<PotionInfo[]>(`${API}/api/potions`).then((potions) => {
      const m: Record<string, PotionInfo> = {};
      for (const p of potions) m[p.id] = p;
      setPotionData(m);
    });
  }, [hash]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">{t("Loading...", lang)}</div>;
  if (notFound || !run) return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <p className="text-[var(--text-muted)] mb-4">{t("Run not found.", lang)}</p>
      <Link href={`${lp}/leaderboards`} className="text-[var(--accent-gold)] hover:underline">&larr; {t("Back to", lang)}</Link>
    </div>
  );

  const player = run.players[0];
  const charId = cleanId(player.character);
  const charColor = CHAR_CSS_VAR[charId.toUpperCase()] || "var(--accent-gold)";
  const totalFloors = run.map_point_history?.reduce((sum: number, act: any[]) => sum + act.length, 0) || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href={`${lp}/leaderboards`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          &larr; {t("Back to", lang)}
        </Link>
        <button onClick={copyLink}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors">
          {copied ? t("Copied!", lang) : t("Share", lang)}
        </button>
      </div>

      {/* Compact header — Victory/Defeat banner + ascension */}
      <div
        className="rounded-xl border px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-2"
        style={{ borderColor: `color-mix(in srgb, ${charColor} 40%, transparent)`, background: `color-mix(in srgb, ${charColor} 8%, var(--bg-card))` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-xl font-bold"
            style={{ color: run.win ? "var(--color-silent)" : run.was_abandoned ? "var(--text-muted)" : "var(--color-ironclad)" }}
          >
            {run.win ? t("Victory", lang) : run.was_abandoned ? t("Abandoned", lang) : t("Defeat", lang)}
          </span>
          <Link href={`${lp}/characters/${charId.toLowerCase()}`} className="text-base hover:underline" style={{ color: charColor }}>
            {displayName(player.character)}
          </Link>
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {t("Ascension", lang)} {run.ascension || 0}
          {!run.win && !run.was_abandoned && run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE" && (
            <>
              {" · "}{t("Killed by", lang)}{" "}
              <Link href={`${lp}/encounters/${cleanId(run.killed_by_encounter).toLowerCase()}`} className="hover:underline" style={{ color: "var(--color-ironclad)" }}>
                {displayName(run.killed_by_encounter)}
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
      </>}
    </div>
  );
}
