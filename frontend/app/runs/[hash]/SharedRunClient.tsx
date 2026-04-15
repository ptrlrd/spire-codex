"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "@/app/components/RichDescription";
import RunSummary from "./RunSummary";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Import types and components from the parent RunsClient
// Duplicating the core display logic here for the shared view

interface CardInfo { id: string; name: string; description: string; type: string; rarity: string; cost: number; image_url: string | null; }
interface RelicInfo { id: string; name: string; description: string; rarity: string; image_url: string | null; }

function cleanId(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "");
}

function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function CardPill({ cardId, upgraded, enchantment, cardData, lp, className }: {
  cardId: string; upgraded?: boolean; enchantment?: string;
  cardData: Record<string, CardInfo>; lp: string; className?: string;
}) {
  const [show, setShow] = useState(false);
  const info = cardData[cardId];
  return (
    <Link href={`${lp}/cards/${cardId.toLowerCase()}`} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {info?.name || displayName(`CARD.${cardId}`)}
      {upgraded && "+"}
      {enchantment && <span className="text-[var(--color-necrobinder)] ml-1">[{displayName(`ENCHANTMENT.${enchantment}`)}]</span>}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${API}${info.image_url}`} alt="" className="w-10 h-10 object-cover rounded" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.type} · {info.rarity} · {info.cost}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

function RelicPill({ relicId, relicData, lp, className, children }: {
  relicId: string; relicData: Record<string, RelicInfo>; lp: string; className?: string; children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = relicData[relicId];
  return (
    <Link href={`${lp}/relics/${relicId.toLowerCase()}`} className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children || (info?.name || displayName(`RELIC.${relicId}`))}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && <img src={`${API}${info.image_url}`} alt="" className="w-8 h-8 object-contain" crossOrigin="anonymous" />}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed"><RichDescription text={info.description} /></div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

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
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
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
  }, [hash]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">Loading...</div>;
  if (notFound || !run) return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <p className="text-[var(--text-muted)] mb-4">Run not found.</p>
      <Link href={`${lp}/runs`} className="text-[var(--accent-gold)] hover:underline">&larr; Back</Link>
    </div>
  );

  const player = run.players[0];
  const charId = cleanId(player.character);
  const charColor = CHAR_CSS_VAR[charId.toUpperCase()] || "var(--accent-gold)";
  const totalFloors = run.map_point_history?.reduce((sum: number, act: any[]) => sum + act.length, 0) || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href={`${lp}/runs`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          &larr; Back
        </Link>
        <button onClick={copyLink}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors">
          {copied ? "Copied!" : "Share"}
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
            {run.win ? "Victory" : run.was_abandoned ? "Abandoned" : "Defeat"}
          </span>
          <Link href={`${lp}/characters/${charId.toLowerCase()}`} className="text-base hover:underline" style={{ color: charColor }}>
            {displayName(player.character)}
          </Link>
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          Ascension {run.ascension || 0}
          {!run.win && !run.was_abandoned && run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE" && (
            <>
              {" · Killed by "}
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
        charColor={charColor}
        langPrefix={lp}
      />

      {/* Detailed history toggle */}
      <button
        onClick={() => setShowDetails((v) => !v)}
        className="w-full text-left text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-3 flex items-center gap-2"
      >
        <span className={`inline-block transition-transform ${showDetails ? "rotate-90" : ""}`}>&gt;</span>
        {showDetails ? "Hide" : "Show"} detailed history (deck list, relic acquisition floors, floor-by-floor stats)
      </button>

      {showDetails && <>
      {/* Deck */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Final Deck ({player.deck.length})</h2>
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Relics ({player.relics.length})</h2>
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Floor History</h2>
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
