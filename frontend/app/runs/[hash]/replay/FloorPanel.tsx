"use client";

import { imageUrl } from "@/lib/image-url";
import type { ScoresMap } from "@/lib/use-entity-scores";
import type { ReplayDecision, ReplayFloor, ReplayLine, ReplayOption } from "@/lib/replay";
import { isCombatKind } from "@/lib/replay";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { type EncounterMap, type MonsterMap, LiveCardImg, safeId } from "@/app/live/live-shared";
import { cleanId, displayName, type CardInfo, type PotionInfo, type RelicInfo } from "../RunPills";

export interface Catalog {
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  monsters: MonsterMap;
  encounters: EncounterMap;
  cardScores: ScoresMap;
  relicScores: ScoresMap;
}

export const KIND_LABEL: Record<string, string> = {
  combat: "Combat",
  monster: "Combat",
  elite: "Elite",
  boss: "Boss",
  merchant: "Shop",
  shop: "Shop",
  restsite: "Rest site",
  rest: "Rest site",
  treasure: "Treasure",
  event: "Event",
  unknown: "Unknown",
  ancient: "Ancient",
};

function n(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function cardName(id: string, cat: Catalog): string {
  return cat.cards[id]?.name || displayName(`CARD.${id}`);
}
function relicName(id: string, cat: Catalog): string {
  return cat.relics[id]?.name || displayName(`RELIC.${id}`);
}
function potionName(id: string, cat: Catalog): string {
  return cat.potions[id]?.name || displayName(`POTION.${id}`);
}
function monsterName(id: string, cat: Catalog): string {
  return cat.monsters[cleanId(id)]?.name || displayName(`MONSTER.${id}`);
}
export function encounterName(id: string | null, cat: Catalog): string {
  if (!id) return "";
  return cat.encounters[id]?.name || displayName(`ENCOUNTER.${id}`);
}

export function floorTitle(f: ReplayFloor, cat: Catalog): string {
  if (isCombatKind(f.kind)) return encounterName(f.id, cat) || t("Combat", "eng");
  if (f.kind === "event" && f.id) return displayName(`EVENT.${f.id}`);
  return KIND_LABEL[f.kind] ?? displayName(f.kind);
}

function ScoreChip({ id, scores }: { id: string; scores: ScoresMap }) {
  const sc = scores[id.toUpperCase()];
  if (!sc || sc.score === null) return null;
  return (
    <span className="ml-auto flex items-center gap-2 text-[10px] tabular-nums text-[var(--text-muted)]">
      <span title="Codex score">{sc.score}</span>
      <span title="Win rate at this bracket">{sc.win_rate.toFixed(0)}%</span>
    </span>
  );
}

function OptionRow({ o, dec, cat }: { o: ReplayOption; dec: ReplayDecision; cat: Catalog }) {
  const { lang } = useLanguage();
  const isCard = o.kind === "card" || o.kind === "remove" || o.kind === "transform" || o.kind === "upgrade";
  const isRelic = o.kind === "relic" || !!o.grantsRelic;
  const label = o.label
    ? o.label
    : isCard
      ? `${cardName(o.id, cat)}${o.upgraded ? "+" : ""}`
      : isRelic
        ? relicName(o.grantsRelic || o.id, cat)
        : o.kind === "potion"
          ? potionName(o.id, cat)
          : displayName(o.id);
  const tone = o.chosen
    ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--text-primary)]"
    : o.selectable
      ? "border-[var(--border-subtle)] text-[var(--text-secondary)]"
      : "border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60";
  return (
    <li className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${tone}`}>
      {isCard && safeId(o.id) && (
        <LiveCardImg id={o.id} upgraded={o.upgraded} alt={label} className="h-9 w-auto rounded-sm" portrait={cat.cards[o.id]?.image_url} />
      )}
      {isRelic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(cat.relics[o.grantsRelic || o.id]?.image_url || `/static/images/relics/${(o.grantsRelic || o.id).toLowerCase()}.png`)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
      )}
      <span className="min-w-0 truncate">{label}</span>
      {o.chosen && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">{t("Taken", lang)}</span>}
      {!o.selectable && o.reason && <span className="text-[10px] uppercase tracking-wider">{o.reason}</span>}
      {isCard && <ScoreChip id={o.id} scores={cat.cardScores} />}
      {isRelic && <ScoreChip id={o.grantsRelic || o.id} scores={cat.relicScores} />}
      {dec.paid && o.chosen && dec.paid.kind !== "removal_service" && (
        <span className="text-[10px] text-[var(--text-muted)]">{dec.paid.cost} {dec.paid.resource}</span>
      )}
    </li>
  );
}

function decisionTitle(d: ReplayDecision): string {
  if (d.type === "card_reward") return "Card reward";
  if (d.selectKind === "transform") return "Transform a card";
  if (d.selectKind === "upgrade") return "Upgrade a card";
  if (d.selectKind === "remove" || d.paid?.kind === "removal_service") return "Remove a card";
  if (d.type === "event") return d.eventId ? displayName(`EVENT.${d.eventId}`) : "Event";
  if (d.type === "relic_reward") return "Relic reward";
  if (d.type === "potion_reward") return "Potion reward";
  return displayName(d.type);
}

function DecisionCard({ d, cat }: { d: ReplayDecision; cat: Catalog }) {
  const { lang } = useLanguage();
  const shown = d.options.filter((o) => o.presented);
  const picked = shown.some((o) => o.chosen);
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t(decisionTitle(d), lang)}</h4>
        <span className="text-xs text-[var(--text-muted)]">
          {shown.length} {t("offered", lang)}
          {d.nSelectable < d.nPresented && ` · ${d.nSelectable} ${t("selectable", lang)}`}
          {d.goldOnHand !== undefined && ` · ${d.goldOnHand} ${t("gold", lang)}`}
        </span>
        {d.outcome === "skip" && <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("Skipped", lang)}</span>}
        {d.outcome === "reroll" && <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("Rerolled", lang)}</span>}
        {d.outcome === "unresolved" && !picked && <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{t("No pick recorded", lang)}</span>}
        {d.paid && d.paid.kind === "removal_service" && (
          <span className="text-xs text-[var(--text-muted)]">{t("Paid", lang)} {d.paid.cost} {d.paid.resource}</span>
        )}
      </header>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {shown.map((o) => (
          <OptionRow key={`${d.id}-${o.index}`} o={o} dec={d} cat={cat} />
        ))}
      </ul>
    </section>
  );
}

function describePlay(play: ReplayLine, hits: ReplayLine[], cat: Catalog): string {
  const name = `${cardName(s(play.id), cat)}${n(play.up) ? "+" : ""}`;
  const dmg = hits.reduce((sum, h) => sum + (n(h.dmg) ?? 0), 0);
  const target = s(play.target);
  const parts = [name];
  if (target && target !== "player") parts.push(`→ ${monsterName(target, cat)}`);
  if (dmg > 0) parts.push(`${dmg} dmg`);
  if (n(play.cost_paid) !== null) parts.push(`${play.cost_paid}⚡`);
  return parts.join(" ");
}

function TurnBlock({ turn, cat }: { turn: { n: number; side: string; lines: ReplayLine[] }; cat: Catalog }) {
  const { lang } = useLanguage();
  const items: string[] = [];
  const lines = turn.lines;
  if (turn.side === "player") {
    const drawn = lines.filter((l) => l.t === "draw").map((l) => cardName(s(l.id), cat));
    if (drawn.length) items.push(`${t("Drew", lang)}: ${drawn.join(", ")}`);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.t === "play") {
        const hits: ReplayLine[] = [];
        for (let j = i + 1; j < lines.length && lines[j].t !== "play"; j++) {
          if (lines[j].t === "hit" && s(lines[j].src) === "player") hits.push(lines[j]);
        }
        items.push(`${t("Played", lang)} ${describePlay(l, hits, cat)}`);
      } else if (l.t === "block" && n(l.n)) {
        items.push(`${t("Block", lang)} +${l.n}${l.card ? ` (${cardName(s(l.card), cat)})` : ""}`);
      } else if (l.t === "power" && s(l.id)) {
        items.push(`${displayName(s(l.id).replace(/_POWER$/, ""))} ${n(l.n) ?? ""}${l.tgt && l.tgt !== "player" ? ` → ${monsterName(s(l.tgt), cat)}` : ""}`);
      } else if (l.t === "potion_used") {
        items.push(`${t("Used", lang)} ${potionName(s(l.id), cat)}`);
      } else if (l.t === "exhaust") {
        items.push(`${t("Exhausted", lang)} ${cardName(s(l.id), cat)}`);
      }
    }
  } else {
    for (const l of lines) {
      if (l.t === "hit" && s(l.dst) === "player") {
        const src = s(l.src);
        items.push(`${src === "effect" ? t("Effect", lang) : monsterName(src, cat)} ${t("hit for", lang)} ${n(l.dmg) ?? 0}${n(l.blocked) ? ` (${l.blocked} ${t("blocked", lang)})` : ""}`);
      } else if (l.t === "power" && s(l.tgt) === "player") {
        items.push(`${displayName(s(l.id).replace(/_POWER$/, ""))} ${n(l.n) ?? ""}`);
      }
    }
  }
  const hpLine = [...lines].reverse().find((l) => l.t === "hp");
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 py-1.5">
      <span className={`text-xs font-semibold tabular-nums ${turn.side === "player" ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]"}`}>
        {turn.side === "player" ? t("Turn", lang) : t("Enemy", lang)} {turn.n}
      </span>
      <span className="text-sm text-[var(--text-secondary)]">
        {items.length ? items.join(" · ") : <span className="text-[var(--text-muted)]">{t("Nothing recorded", lang)}</span>}
        {hpLine && n(hpLine.hp) !== null && <span className="ml-2 text-xs text-[var(--text-muted)]">HP {n(hpLine.hp)}</span>}
      </span>
    </li>
  );
}

function CombatBlock({ f, cat }: { f: ReplayFloor; cat: Catalog }) {
  const { lang } = useLanguage();
  const c = f.combat!;
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex -space-x-2">
          {c.enemies.map((e) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${e.i}-${e.id}`}
              src={imageUrl(cat.monsters[cleanId(e.id)]?.image_url || `/static/images/monsters/${e.id.toLowerCase()}.webp`)}
              alt={monsterName(e.id, cat)}
              title={`${monsterName(e.id, cat)} ${e.hp}/${e.maxHp}`}
              className="h-10 w-10 rounded-full border-2 border-[var(--bg-card)] object-cover"
              loading="lazy"
            />
          ))}
        </div>
        <div className="text-sm">
          <div className="font-semibold text-[var(--text-primary)]">{c.enemies.map((e) => monsterName(e.id, cat)).join(", ")}</div>
          <div className="text-xs text-[var(--text-muted)]">
            <span className={c.result === "victory" ? "text-[var(--accent-gold)]" : "text-[var(--accent-red)]"}>{t(c.result === "victory" ? "Victory" : c.result === "death" ? "Died" : c.result, lang)}</span>
            {" · "}{c.turnCount ?? c.turns.filter((x) => x.side === "player").length} {t("turns", lang)}
            {" · "}{c.damageTaken} {t("damage taken", lang)}
            {c.hpEnd !== null && ` · HP ${c.hpEnd}`}
          </div>
        </div>
      </header>
      <ol className="divide-y divide-[var(--border-subtle)]">
        {c.turns.map((tn, i) => (
          <TurnBlock key={`${tn.side}-${tn.n}-${i}`} turn={tn} cat={cat} />
        ))}
      </ol>
    </section>
  );
}

function LootLine({ f, cat }: { f: ReplayFloor; cat: Catalog }) {
  const { lang } = useLanguage();
  const decided = new Set(f.decisions.flatMap((d) => d.resolutions.map((r) => r.s)));
  const bits: string[] = [];
  for (const l of f.lines) {
    if (decided.has(l.s)) continue;
    if (l.t === "relic") bits.push(`${t("Relic", lang)}: ${relicName(s(l.id), cat)}`);
    else if (l.t === "potion_got") bits.push(`${t("Potion", lang)}: ${potionName(s(l.id), cat)}`);
    else if (l.t === "acquire") bits.push(`${t("Card", lang)}: ${cardName(s(l.id), cat)}`);
    else if (l.t === "upgrade") bits.push(`${t("Upgraded", lang)} ${cardName(s(l.id), cat)}`);
    else if (l.t === "remove") bits.push(`${t("Removed", lang)} ${cardName(s(l.id), cat)}`);
    else if (l.t === "transform") bits.push(`${cardName(s(l.from_id), cat)} → ${cardName(s(l.to_id), cat)}`);
    else if (l.t === "rest") bits.push(`${t("Rest", lang)}: ${displayName(s(l.option))}`);
    else if (l.t === "buy" && s(l.kind) !== "removal_service") bits.push(`${t("Bought", lang)} ${s(l.kind) === "card" ? cardName(s(l.id), cat) : s(l.kind) === "relic" ? relicName(s(l.id), cat) : s(l.kind) === "potion" ? potionName(s(l.id), cat) : displayName(s(l.id))} (${n(l.cost_current) ?? 0} ${s(l.cost_resource) || "gold"})`);
    else if (l.t === "hp_loss" && n(l.d)) bits.push(`HP ${l.d}`);
  }
  if (!bits.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {bits.map((b, i) => (
        <li key={i} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)]">{b}</li>
      ))}
    </ul>
  );
}

export default function FloorPanel({ f, cat, maxHp }: { f: ReplayFloor; cat: Catalog; maxHp: number | null }) {
  const { lang } = useLanguage();
  const combatDecisions = f.decisions;
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("Floor", lang)} {f.floor} · {floorTitle(f, cat)}
        </h3>
        <span className="text-xs text-[var(--text-muted)]">{t(KIND_LABEL[f.kind] ?? f.kind, lang)}</span>
        <span className="ml-auto text-xs tabular-nums text-[var(--text-muted)]">
          {f.hpAfter !== null && <>HP {f.hpAfter}{maxHp ? `/${maxHp}` : ""}</>}
          {f.goldAfter !== null && <> · {f.goldAfter} {t("gold", lang)}</>}
        </span>
      </header>
      {f.combat && <CombatBlock f={f} cat={cat} />}
      {combatDecisions.map((d) => (
        <DecisionCard key={d.id} d={d} cat={cat} />
      ))}
      <LootLine f={f} cat={cat} />
      {!f.combat && !f.decisions.length && !f.lines.some((l) => ["relic", "acquire", "potion_got", "upgrade", "remove", "transform", "rest", "buy"].includes(l.t)) && (
        <p className="text-sm text-[var(--text-muted)]">{t("Nothing else was recorded on this floor.", lang)}</p>
      )}
    </div>
  );
}
