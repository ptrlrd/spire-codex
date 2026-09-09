"use client";

import { useT, useGameLocale, type TFn } from "@/lib/i18n";

import type { ReactNode } from "react";
import { imageUrl } from "@/lib/image-url";
import type { ScoresMap } from "@/lib/use-entity-scores";
import type { BuyLine, HitLine, PlayLine, ReplayCombat, ReplayDecision, ReplayFloor, ReplayLine, ReplayOption, ReplayTurn, ShopItem } from "@/lib/replay";
import { isCombatKind } from "@/lib/replay";
import { type EncounterMap, type MonsterMap, LiveCardImg, safeId } from "@/app/[locale]/live/live-shared";
import { cleanId, displayName, type CardInfo, type PotionInfo, type RelicInfo } from "../RunPills";

export interface EventInfo {
  id: string;
  name: string;
}

export interface Catalog {
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  events: Record<string, EventInfo>;
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
export function encounterName(id: string | undefined, cat: Catalog): string {
  if (!id) return "";
  return cat.encounters[id]?.name || displayName(`ENCOUNTER.${id}`);
}

export function floorTitle(f: ReplayFloor, cat: Catalog, t: TFn): string {
  if (isCombatKind(f.kind)) return encounterName(f.id, cat) || t("Combat");
  if (f.kind === "event" && f.id) return cat.events[cleanId(f.id)]?.name || displayName(`EVENT.${f.id}`);
  return t(KIND_LABEL[f.kind] ?? displayName(f.kind));
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

const MARKUP_TONE: Record<string, string> = {
  gold: "text-[var(--accent-gold)]",
  red: "text-[var(--accent-red)]",
  green: "font-semibold text-[var(--text-primary)]",
  blue: "font-semibold text-[var(--text-primary)]",
};

// The game's option text uses [gold]..[/gold] style tags; colour the ones
// the map colours use and drop the rest (images, unknown tags).
function Markup({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\[(\/?)([a-z]+)[^\]]*\]/gi;
  const stack: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const flush = (end: number) => {
    if (end <= last) return;
    const chunk = text.slice(last, end);
    const tone = stack.length ? MARKUP_TONE[stack[stack.length - 1]] : undefined;
    parts.push(tone ? <span key={parts.length} className={tone}>{chunk}</span> : chunk);
  };
  while ((m = re.exec(text))) {
    flush(m.index);
    const tag = m[2].toLowerCase();
    if (tag in MARKUP_TONE) {
      if (m[1]) {
        const i = stack.lastIndexOf(tag);
        if (i >= 0) stack.splice(i, 1);
      } else {
        stack.push(tag);
      }
    }
    last = re.lastIndex;
  }
  flush(text.length);
  return <>{parts}</>;
}

function itemName(kind: string, id: string, cat: Catalog): string {
  if (kind === "card") return cardName(id, cat);
  if (kind === "relic") return relicName(id, cat);
  if (kind === "potion") return potionName(id, cat);
  return displayName(id);
}

function costLabel(l: BuyLine): string {
  return `${l.costCurrent ?? "?"} ${l.costResource}`;
}

const SHOP_KINDS = new Set(["merchant", "shop"]);
export function isShopKind(kind: string): boolean {
  return SHOP_KINDS.has(kind);
}

function describeLine(l: ReplayLine, cat: Catalog, t: TFn): string | undefined {
  switch (l.t) {
    case "relic":
      return `${t("Relic")}: ${relicName(l.id, cat)}`;
    case "potion_got":
      return `${t("Potion")}: ${potionName(l.id, cat)}`;
    case "acquire":
      return `${t("Card")}: ${cardName(l.id, cat)}`;
    case "upgrade":
      return `${t("Upgraded")} ${cardName(l.id, cat)}`;
    case "remove":
      return `${t("Removed")} ${cardName(l.id, cat)}`;
    case "transform":
      return `${cardName(l.fromId, cat)} → ${cardName(l.toId, cat)}`;
    case "rest":
      return `${t("Rest")}: ${displayName(l.option ?? "")}`;
    case "buy":
      return l.kind === "removal_service"
        ? `${t("Card removal")} (${costLabel(l)})`
        : `${t("Bought")} ${itemName(l.kind, l.id ?? "", cat)} (${costLabel(l)})`;
    case "hp":
      return l.d ? `HP ${l.d > 0 ? "+" : ""}${l.d}` : undefined;
    case "hp_loss":
      return l.dmg ? `HP -${Math.abs(l.dmg)}` : undefined;
    case "resume":
      return `${t("Reloaded from a save")}${l.reloads > 1 ? ` (${l.reloads})` : ""}`;
    default:
      return undefined;
  }
}

function Delta({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className={`ml-1 ${value > 0 ? "text-[var(--accent-gold)]" : "text-[var(--accent-red)]"}`}>
      ({value > 0 ? "+" : ""}{value})
    </span>
  );
}

function OptionRow({ o, dec, cat }: { o: ReplayOption; dec: ReplayDecision; cat: Catalog }) {
  const t = useT();
  const lang = useGameLocale();
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
    <li className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${tone}`}>
      {isCard && safeId(o.id) && (
        <LiveCardImg id={o.id} upgraded={o.upgraded} alt={label} className="h-9 w-auto rounded-sm" portrait={cat.cards[o.id]?.image_url} />
      )}
      {isRelic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(cat.relics[o.grantsRelic || o.id]?.image_url || `/static/images/relics/${(o.grantsRelic || o.id).toLowerCase()}.png`)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {o.desc && (
          <span className="block text-xs leading-snug text-[var(--text-muted)]">
            <Markup text={o.desc} />
          </span>
        )}
      </span>
      {o.chosen && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">{t("Taken")}</span>}
      {!o.selectable && o.reason && <span className="text-[10px] uppercase tracking-wider">{o.reason}</span>}
      {isCard && <ScoreChip id={o.id} scores={cat.cardScores} />}
      {isRelic && <ScoreChip id={o.grantsRelic || o.id} scores={cat.relicScores} />}
      {dec.paid && o.chosen && dec.paid.kind !== "removal_service" && dec.paid.cost !== undefined && (
        <span className="text-[10px] text-[var(--text-muted)]">{dec.paid.cost} {dec.paid.resource}</span>
      )}
    </li>
  );
}

function decisionTitle(d: ReplayDecision, cat: Catalog, t: TFn): string {
  if (d.type === "card_reward") return "Card reward";
  if (d.selectKind === "transform") return "Transform a card";
  if (d.selectKind === "upgrade") return "Upgrade a card";
  if (d.selectKind === "remove" || d.paid?.kind === "removal_service") return "Remove a card";
  if (d.type === "event") return d.eventId ? cat.events[cleanId(d.eventId)]?.name || displayName(`EVENT.${d.eventId}`) : "Event";
  if (d.type === "relic_reward") return "Relic reward";
  if (d.type === "potion_reward") return "Potion reward";
  return displayName(d.type);
}

function DecisionCard({ d, cat }: { d: ReplayDecision; cat: Catalog }) {
  const t = useT();
  const lang = useGameLocale();
  const shown = d.options.filter((o) => o.presented);
  const picked = shown.some((o) => o.chosen);
  const effects = d.resolutions.map((l) => describeLine(l, cat, t)).filter((e): e is string => !!e);
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{decisionTitle(d, cat, t)}</h4>
        <span className="text-xs text-[var(--text-muted)]">
          {shown.length} {t("offered")}
          {d.nSelectable !== undefined &&
            d.nPresented !== undefined &&
            d.nSelectable < d.nPresented &&
            ` · ${d.nSelectable} ${t("selectable")}`}
          {d.goldOnHand !== undefined && ` · ${d.goldOnHand} ${t("gold")}`}
        </span>
        {d.outcome === "skip" && <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("Skipped")}</span>}
        {d.outcome === "reroll" && <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("Rerolled")}</span>}
        {d.selectionStatus === "unknown" && !picked && d.outcome !== "skip" && d.outcome !== "reroll" && (
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{t("Chosen option not recorded")}</span>
        )}
        {d.selectionStatus === "partial" && (
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{t("Some picks not recorded")}</span>
        )}
        {d.selectionStatus === "conflict" && (
          <span className="text-xs uppercase tracking-wider text-[var(--accent-red)]">{t("Conflicting choice records")}</span>
        )}
        {d.paid && d.paid.kind === "removal_service" && (
          <span className="text-xs text-[var(--text-muted)]">{t("Paid")} {d.paid.cost} {d.paid.resource}</span>
        )}
      </header>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {shown.map((o) => (
          <OptionRow key={`${d.id}-${o.index}`} o={o} dec={d} cat={cat} />
        ))}
      </ul>
      {effects.length > 0 && (
        <ul className="mt-2 flex flex-wrap items-center gap-1.5">
          <li className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("Outcome")}</li>
          {effects.map((e, i) => (
            <li key={i} className="rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function boughtSlots(buys: BuyLine[], kind: string): Set<number> {
  return new Set(buys.filter((b) => b.kind === kind && b.slot !== undefined).map((b) => b.slot as number));
}

function StockRow({ item, kind, bought, cat }: { item: ShopItem; kind: string; bought: boolean; cat: Catalog }) {
  const t = useT();
  const lang = useGameLocale();
  const name = itemName(kind, item.id, cat);
  const tone = bought
    ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--text-primary)]"
    : "border-[var(--border-subtle)] text-[var(--text-secondary)]";
  return (
    <li className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${tone}`}>
      {kind === "card" && safeId(item.id) && <LiveCardImg id={item.id} alt={name} className="h-9 w-auto rounded-sm" portrait={cat.cards[item.id]?.image_url} />}
      {kind === "relic" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(cat.relics[item.id]?.image_url || `/static/images/relics/${item.id.toLowerCase()}.png`)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
      )}
      {kind === "potion" && cat.potions[item.id]?.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(cat.potions[item.id].image_url)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {item.sale && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">{t("Sale")}</span>}
      {item.cost !== undefined && <span className="text-xs tabular-nums text-[var(--text-muted)]">{item.cost} {t("gold")}</span>}
      {bought && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">{t("Bought")}</span>}
      {kind === "card" && <ScoreChip id={item.id} scores={cat.cardScores} />}
      {kind === "relic" && <ScoreChip id={item.id} scores={cat.relicScores} />}
    </li>
  );
}

function ShopBlock({ f, prev, cat }: { f: ReplayFloor; prev?: ReplayFloor; cat: Catalog }) {
  const t = useT();
  const lang = useGameLocale();
  const buys = f.lines.filter((l): l is BuyLine => l.t === "buy");
  const removed = f.lines.flatMap((l) => (l.t === "remove" ? [l.id] : []));
  const goldIn = f.shop?.gold ?? prev?.goldAfter;
  const goldBuys = buys.filter((l) => l.costResource === "gold");
  const spentKnown = goldBuys.every((l) => l.costCurrent !== undefined);
  const spent = goldBuys.reduce((sum, l) => sum + (l.costCurrent ?? 0), 0);
  const stock = f.shop;
  const groups = stock
    ? ([
        ["card", stock.cards],
        ["relic", stock.relics],
        ["potion", stock.potions],
      ] as const)
    : [];
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--text-muted)]">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t("Shop")}</h4>
        {goldIn !== undefined && <span>{t("Gold in")} {goldIn}</span>}
        <span>{t("Spent")} {spentKnown ? spent : "?"}</span>
        {f.goldAfter !== undefined && <span>{t("Gold out")} {f.goldAfter}</span>}
      </header>
      {stock && (
        <div className="mb-3 space-y-2">
          {groups.map(([kind, items]) =>
            items.length ? (
              <ul key={kind} className="grid gap-1.5 sm:grid-cols-2">
                {items.map((item) => (
                  <StockRow key={`${kind}-${item.slot}`} item={item} kind={kind} bought={boughtSlots(buys, kind).has(item.slot)} cat={cat} />
                ))}
              </ul>
            ) : null,
          )}
          {stock.removalCost !== undefined && (
            <p className="text-xs text-[var(--text-muted)]">
              {t("Card removal")}: {stock.removalCost} {t("gold")}
              {removed.length > 0 && ` · ${t("Removed")} ${removed.map((id) => cardName(id, cat)).join(", ")}`}
            </p>
          )}
        </div>
      )}
      {buys.length ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {buys.map((l, i) => {
            const removal = l.kind === "removal_service";
            const target = removal ? removed[buys.slice(0, i).filter((b) => b.kind === "removal_service").length] : l.id;
            const label = removal ? `${t("Card removal")}${target ? `: ${cardName(target, cat)}` : ""}` : itemName(l.kind, l.id ?? "", cat);
            return (
              <li key={`${l.s}-${i}`} className="flex items-center gap-2 rounded-md border border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] px-2.5 py-1.5 text-sm text-[var(--text-primary)]">
                {(l.kind === "card" || removal) && target && safeId(target) && (
                  <LiveCardImg id={target} alt={label} className="h-9 w-auto rounded-sm" portrait={cat.cards[target]?.image_url} />
                )}
                {l.kind === "relic" && l.id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(cat.relics[l.id]?.image_url || `/static/images/relics/${l.id.toLowerCase()}.png`)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
                )}
                {l.kind === "potion" && l.id && cat.potions[l.id]?.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(cat.potions[l.id].image_url)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
                )}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  -{costLabel(l)}
                  {l.goldOnHand !== undefined && ` · ${l.goldOnHand} ${t("after")}`}
                </span>
                {l.kind === "card" && l.id && <ScoreChip id={l.id} scores={cat.cardScores} />}
                {l.kind === "relic" && l.id && <ScoreChip id={l.id} scores={cat.relicScores} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{t("Nothing bought")}</p>
      )}
    </section>
  );
}

function describePlay(play: PlayLine, hits: HitLine[], cat: Catalog): string {
  const name = `${cardName(play.id, cat)}${play.up ? "+" : ""}`;
  const own = hits.filter((h) => (h.card ? h.card === play.id : true) && h.dmg !== undefined);
  const dmg = own.reduce((sum, h) => sum + (h.dmg ?? 0), 0);
  const parts = [name];
  if (play.target && play.target !== "player") parts.push(`→ ${monsterName(play.target, cat)}`);
  if (dmg > 0) parts.push(`${dmg} dmg`);
  if (play.costPaid !== undefined) parts.push(`${play.costPaid}⚡`);
  return parts.join(" ");
}

function TurnBlock({ turn, cat }: { turn: ReplayTurn; cat: Catalog }) {
  const t = useT();
  const lang = useGameLocale();
  const items: string[] = [];
  const lines = turn.lines;
  if (turn.side === "player") {
    const drawn = lines.flatMap((l) => (l.t === "draw" ? [cardName(l.id, cat)] : []));
    if (drawn.length) items.push(`${t("Drew")}: ${drawn.join(", ")}`);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      switch (l.t) {
        case "play": {
          const hits: HitLine[] = [];
          for (let j = i + 1; j < lines.length && lines[j].t !== "play"; j++) {
            const h = lines[j];
            if (h.t === "hit" && h.src === "player") hits.push(h);
          }
          items.push(`${t("Played")} ${describePlay(l, hits, cat)}`);
          break;
        }
        case "block":
          if (l.n) items.push(`${t("Block")} +${l.n}${l.card ? ` (${cardName(l.card, cat)})` : ""}`);
          break;
        case "power":
          items.push(`${displayName(l.id.replace(/_POWER$/, ""))} ${l.n ?? ""}${l.tgt && l.tgt !== "player" ? ` → ${monsterName(l.tgt, cat)}` : ""}`);
          break;
        case "potion_used":
          items.push(`${t("Used")} ${potionName(l.id, cat)}`);
          break;
        case "exhaust":
          items.push(`${t("Exhausted")} ${cardName(l.id, cat)}`);
          break;
      }
    }
  } else {
    for (const l of lines) {
      if (l.t === "hit" && l.dst === "player" && l.dmg !== undefined) {
        const src = l.src ?? "";
        items.push(`${src === "effect" ? t("Effect") : monsterName(src, cat)} ${t("hit for")} ${l.dmg}${l.blocked ? ` (${l.blocked} ${t("blocked")})` : ""}`);
      } else if (l.t === "power" && l.tgt === "player") {
        items.push(`${displayName(l.id.replace(/_POWER$/, ""))} ${l.n ?? ""}`);
      }
    }
  }
  const hpLine = lines.findLast((l) => l.t === "hp");
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 py-1.5">
      <span className={`text-xs font-semibold tabular-nums ${turn.side === "player" ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]"}`}>
        {turn.side === "player" ? t("Turn") : t("Enemy")} {turn.n}
      </span>
      <span className="text-sm text-[var(--text-secondary)]">
        {items.length ? items.join(" · ") : <span className="text-[var(--text-muted)]">{t("Nothing recorded")}</span>}
        {hpLine && <span className="ml-2 text-xs text-[var(--text-muted)]">HP {hpLine.hp}</span>}
      </span>
    </li>
  );
}

/** Names each fight on the floor. Two starts sharing a combat id are one fight
 * retried after a reload, not two fights, so they are numbered as attempts. */
function combatLabels(combats: ReplayCombat[], t: TFn): (string | undefined)[] {
  const keys = combats.map((c, i) => c.combatId ?? `\u0000${i}`);
  const distinct = [...new Set(keys)];
  return keys.map((key, i) => {
    const fight = distinct.indexOf(key) + 1;
    const attempts = keys.filter((k) => k === key).length;
    if (attempts > 1) return t("Fight {n}, attempt {k}", { n: fight, k: keys.slice(0, i + 1).filter((k) => k === key).length });
    return distinct.length > 1 ? t("Fight {n} of {of}", { n: fight, of: distinct.length }) : undefined;
  });
}

function CombatBlock({ c, label, cat }: { c: ReplayCombat; label?: string; cat: Catalog }) {
  const t = useT();
  const lang = useGameLocale();
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
          <div className="font-semibold text-[var(--text-primary)]">
            {label && <span className="mr-1.5 text-xs text-[var(--text-muted)]">{label}</span>}
            {c.enemies.map((e) => monsterName(e.id, cat)).join(", ")}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {c.result ? (
              <>
                <span className={c.result === "victory" ? "text-[var(--accent-gold)]" : "text-[var(--accent-red)]"}>{t(c.result === "victory" ? "Victory" : c.result === "death" ? "Died" : displayName(c.result))}</span>
                {" · "}
              </>
            ) : (
              <>
                <span className="text-[var(--text-muted)]">{t(c.endRecorded ? "Result not recorded" : "End not recorded")}</span>
                {" · "}
              </>
            )}
            {c.turnCount ?? c.turns.filter((x) => x.side === "player").length} {t("turns")}
            {" · "}
            {c.hpLost !== undefined
              ? `${c.hpLost} ${t("HP lost")}`
              : c.hpLossRecorded !== undefined
                ? t("At least {n} HP lost", { n: c.hpLossRecorded })
                : t("HP lost unknown")}
            {c.hpEnd !== undefined && ` · HP ${c.hpEnd}`}
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
  const t = useT();
  const lang = useGameLocale();
  const decided = new Set(f.decisions.flatMap((d) => d.resolutions.map((r) => r.s)));
  const bits: string[] = [];
  for (const l of f.lines) {
    if (decided.has(l.s)) continue;
    if (isShopKind(f.kind) && (l.t === "buy" || l.t === "remove" || l.t === "acquire")) continue;
    if (l.t === "resume") continue;
    if (f.combats.length && (l.t === "hp" || l.t === "hp_loss")) continue;
    const text = describeLine(l, cat, t);
    if (text) bits.push(text);
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

export default function FloorPanel({ f, prev, cat, maxHp }: { f: ReplayFloor; prev?: ReplayFloor; cat: Catalog; maxHp?: number }) {
  const t = useT();
  const lang = useGameLocale();
  // An event's "Proceed" page is recorded as a decision with nothing to
  // pick; it adds nothing the previous card didn't say.
  const visibleDecisions = f.decisions.filter((d) => !(d.type === "event" && d.nPresented === 0 && d.resolutions.length === 0));
  const combatNames = combatLabels(f.combats, t);
  const hpDelta = prev?.hpAfter !== undefined && f.hpAfter !== undefined ? f.hpAfter - prev.hpAfter : 0;
  const goldDelta = prev?.goldAfter !== undefined && f.goldAfter !== undefined ? f.goldAfter - prev.goldAfter : 0;
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("Floor")} {f.floor} · {floorTitle(f, cat, t)}
        </h3>
        <span className="text-xs text-[var(--text-muted)]">{t(KIND_LABEL[f.kind] ?? f.kind)}</span>
        {f.resumes.length > 0 && (
          <span className="rounded-md border border-[var(--accent-red)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-red)]">
            {t("Reloaded from a save")}
            {f.resumes[f.resumes.length - 1].reloads > 1 ? ` ×${f.resumes[f.resumes.length - 1].reloads}` : ""}
          </span>
        )}
        <span className="ml-auto text-xs tabular-nums text-[var(--text-muted)]">
          {f.hpAfter !== undefined && <>HP {f.hpAfter}{maxHp ? `/${maxHp}` : ""}<Delta value={hpDelta} /></>}
          {f.goldAfter !== undefined && <> · {f.goldAfter} {t("gold")}<Delta value={goldDelta} /></>}
        </span>
      </header>
      {f.combats.map((c, i) => (
        <CombatBlock key={`${c.combatId ?? c.encounter}-${i}`} c={c} label={combatNames[i]} cat={cat} />
      ))}
      {isShopKind(f.kind) && <ShopBlock f={f} prev={prev} cat={cat} />}
      {visibleDecisions.map((d) => (
        <DecisionCard key={d.id} d={d} cat={cat} />
      ))}
      <LootLine f={f} cat={cat} />
      {!f.combats.length && !f.decisions.length && !f.lines.some((l) => ["relic", "acquire", "potion_got", "upgrade", "remove", "transform", "rest", "buy"].includes(l.t)) && (
        <p className="text-sm text-[var(--text-muted)]">{t("Nothing else was recorded on this floor.")}</p>
      )}
    </div>
  );
}
