"use client";

import { useT, useGameLocale, type TFn } from "@/lib/i18n";

import type { ReactNode } from "react";
import { imageUrl } from "@/lib/image-url";
import type { ScoresMap } from "@/lib/use-entity-scores";
import type { BuyLine, HitLine, ReplayCombat, ReplayDecision, ReplayFloor, ReplayLine, ReplayOption, ReplayTurn, ShopItem } from "@/lib/replay";
import { isCombatKind } from "@/lib/replay";
import { type EncounterMap, type MonsterMap, LiveCardImg, safeId } from "@/app/[locale]/live/live-shared";
import { CardPill, PotionPill, RelicPill, cleanId, displayName, type CardInfo, type PotionInfo, type RelicInfo } from "../RunPills";
import { useBetaPrefix } from "@/lib/use-lang-prefix";

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
function moveName(monsterId: string, moveId: string, cat: Catalog): string {
  return cat.monsters[cleanId(monsterId)]?.moves?.find((m) => m.id === moveId)?.name || displayName(moveId);
}

const PILL = "font-semibold text-[var(--text-primary)] underline decoration-[var(--border-subtle)] underline-offset-2 hover:decoration-[var(--accent-gold)]";

function Card({ id, up, cat, bp }: { id: string; up?: boolean; cat: Catalog; bp: string }) {
  return <CardPill cardId={id} upgraded={up} cardData={cat.cards} bp={bp} className={PILL} />;
}
function Relic({ id, cat, bp }: { id: string; cat: Catalog; bp: string }) {
  return <RelicPill relicId={id} relicData={cat.relics} bp={bp} className={PILL} />;
}
function Potion({ id, cat, bp }: { id: string; cat: Catalog; bp: string }) {
  return <PotionPill potionId={id} potionData={cat.potions} bp={bp} className={PILL} />;
}

/** t() with one entity pill substituted for the {card}/{item}/{potion} slot. */
function withPill(text: string, slot: string, pill: ReactNode): ReactNode {
  const i = text.indexOf(slot);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      {pill}
      {text.slice(i + slot.length)}
    </>
  );
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

interface Described {
  key: string;
  node: ReactNode;
}

const SLOT = "\u0000";

function describeLine(l: ReplayLine, cat: Catalog, t: TFn, who: string, bp: string, healed?: number): Described | undefined {
  const pill = (key: string, values: Record<string, string | number>, slot: string, node: ReactNode): Described => {
    const text = t(key, { ...values, [slot]: SLOT });
    return { key: t(key, values), node: withPill(text, SLOT, node) };
  };
  const plain = (text: string): Described => ({ key: text, node: text });
  switch (l.t) {
    case "relic":
      return pill("Got {item}", { item: relicName(l.id, cat) }, "item", <Relic id={l.id} cat={cat} bp={bp} />);
    case "potion_got":
      return pill("Got {item}", { item: potionName(l.id, cat) }, "item", <Potion id={l.id} cat={cat} bp={bp} />);
    case "acquire":
      return pill("Took {card}", { card: cardName(l.id, cat) }, "card", <Card id={l.id} cat={cat} bp={bp} />);
    case "upgrade":
      return pill("Upgraded {card}", { card: cardName(l.id, cat) }, "card", <Card id={l.id} up cat={cat} bp={bp} />);
    case "remove":
      return pill("Removed {card}", { card: cardName(l.id, cat) }, "card", <Card id={l.id} cat={cat} bp={bp} />);
    case "transform":
      return {
        key: `${cardName(l.fromId, cat)} → ${cardName(l.toId, cat)}`,
        node: (
          <>
            <Card id={l.fromId} cat={cat} bp={bp} /> → <Card id={l.toId} cat={cat} bp={bp} />
          </>
        ),
      };
    case "rest":
      if (l.option === "heal") return plain(healed ? t("{who} healed for {n} HP", { who, n: healed }) : t("{who} rested and healed", { who }));
      if (l.option === "smith") return plain(t("{who} smithed at the campfire", { who }));
      return plain(t("{who} chose {option} at the campfire", { who, option: displayName(l.option ?? "") }));
    case "buy":
      if (l.kind === "removal_service") return plain(`${t("Card removal")} (${costLabel(l)})`);
      if (l.kind === "card" && l.id) return { key: `${t("Bought")} ${cardName(l.id, cat)}`, node: <>{t("Bought")} <Card id={l.id} cat={cat} bp={bp} /> ({costLabel(l)})</> };
      if (l.kind === "relic" && l.id) return { key: `${t("Bought")} ${relicName(l.id, cat)}`, node: <>{t("Bought")} <Relic id={l.id} cat={cat} bp={bp} /> ({costLabel(l)})</> };
      if (l.kind === "potion" && l.id) return { key: `${t("Bought")} ${potionName(l.id, cat)}`, node: <>{t("Bought")} <Potion id={l.id} cat={cat} bp={bp} /> ({costLabel(l)})</> };
      return plain(`${t("Bought")} ${itemName(l.kind, l.id ?? "", cat)} (${costLabel(l)})`);
    case "hp":
      if (!l.d) return undefined;
      return plain(l.d > 0 ? t("{who} healed for {n} HP", { who, n: l.d }) : t("{who} lost {n} HP", { who, n: -l.d }));
    case "hp_loss":
      return l.dmg ? plain(t("{who} lost {n} HP", { who, n: Math.abs(l.dmg) })) : undefined;
    case "resume":
      return plain(`${t("Reloaded from a save")}${l.reloads > 1 ? ` (${l.reloads})` : ""}`);
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

const TAKEN_TONE = "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--text-primary)]";

function TakenBadge() {
  const t = useT();
  return <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">{t("Taken")}</span>;
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
    ? TAKEN_TONE
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
  if (d.type === "card_reward") return "Reward";
  if (d.selectKind === "transform") return "Transform a card";
  if (d.selectKind === "upgrade") return "Upgrade a card";
  if (d.selectKind === "remove" || d.paid?.kind === "removal_service") return "Remove a card";
  if (d.type === "event") return d.eventId ? cat.events[cleanId(d.eventId)]?.name || displayName(`EVENT.${d.eventId}`) : "Event";
  if (d.type === "relic_reward") return "Relic reward";
  if (d.type === "potion_reward") return "Potion reward";
  return displayName(d.type);
}

function DecisionCard({ d, cat, who }: { d: ReplayDecision; cat: Catalog; who: string }) {
  const t = useT();
  const lang = useGameLocale();
  const bp = useBetaPrefix();
  const shown = d.options.filter((o) => o.presented);
  const picked = shown.some((o) => o.chosen);
  const gold = d.resolutions.reduce((n, l) => n + (l.t === "resolve" && l.rewardKind === "GoldReward" && l.gold ? l.gold : 0), 0);
  const potions = d.resolutions.flatMap((l) => (l.t === "resolve" && l.rewardKind === "PotionReward" && l.id ? [l.id] : []));
  const relics = d.resolutions.flatMap((l) => (l.t === "relic" && !shown.some((o) => o.id === l.id || o.grantsRelic === l.id) ? [l.id] : []));
  const rewards = gold > 0 || potions.length > 0 || relics.length > 0;
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
      {rewards && (
        <ul className="mb-2 flex flex-wrap items-stretch gap-1.5">
          {gold > 0 && (
            <li className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm tabular-nums ${TAKEN_TONE}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl("/static/images/icons/gold_icon.webp")} alt={t("gold")} className="h-4 w-4" loading="lazy" />
              <span className="text-[var(--accent-gold)]">{gold}</span>
              <TakenBadge />
            </li>
          )}
          {potions.map((id, i) => (
            <li key={`p-${id}-${i}`} className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${TAKEN_TONE}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(cat.potions[id]?.image_url || `/static/images/potions/${id.toLowerCase()}.webp`)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
              <Potion id={id} cat={cat} bp={bp} />
              <TakenBadge />
            </li>
          ))}
          {relics.map((id, i) => (
            <li key={`r-${id}-${i}`} className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${TAKEN_TONE}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(cat.relics[id]?.image_url || `/static/images/relics/${id.toLowerCase()}.png`)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
              <Relic id={id} cat={cat} bp={bp} />
              <TakenBadge />
            </li>
          ))}
        </ul>
      )}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {shown.map((o) => (
          <OptionRow key={`${d.id}-${o.index}`} o={o} dec={d} cat={cat} />
        ))}
      </ul>
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

const BLOCK_ICON = "data:image/webp;base64,UklGRvwDAABXRUJQVlA4WAoAAAAQAAAAJwAAJwAAQUxQSFoBAAABkAPZtmlb69m2bduKbDOybdv2t23btm3b0bP3Xuc7jIgJgP+ALIZOij+FRPSSHR1ePIyJeNQe+DHxZmOmGScTbAquFVtfTkxMTIxcW5RmJYzEIWmT2rXz0fjE7D8uryoL1BHmpuGzCMpqWnvpywTxyJODi+vzY0yJuNNXHH3wfnSCfujD/fO9qiSizW8m8LfZkAhWP2ZggxkJa/hJvJFlBiTgsBPve7skkemKUbR3dYJEkm2f0e5lsBGxpd1HOxsG5B5H0DZZUeitGEb63CZJIVT2COlCPAsFuO3GGV5lB7RK7e9Q7pQIULGE7MUY2+AC9FKdHxGeVgsgsARtHaEa3ewNmII556gu5fKjgHzDPYo7DRqAbDf/HdH9Fj3AZvNd8obgTpcV4LN69d+f406LEQsDAKYt18dmXKg3AIYNi7Z9mPhxtFIHGBcKGDi8KEEWfkYDX302+HsEVlA4IHwCAABwDwCdASooACgAPikQhkKhoQ43bwAMAUJZADIF0cgDetugDDLwgHmA8//nZusA9ADyyPZXwAD+AdU+ub/xWcVyCBKA1Kv+q9Pr+x8vX0B7An8O/nn+r/M/vAeg0TdhHqLUFriUiZpcagPxZcPwm9IbFRLYYReMzvl6aHZ/eVYKFDy5eAAA/v+GF3qxhvvQ3hlZ/Ukn+bSLu80VFNzzErt/LJ1/lM//qL11t2uSFWPs0tzEon1GikCDU2/7FPNrlIHgVcsg/prbf+aWENCKy6+ftJgMfLD8GjAeu4eoC84waYL9O0mkXK9KATlmeP7mjydwvmU1ce7n6Wx1fjIIWy/6Qq4XCsf3//Fh3pywBotZh+3OGwn4ZvN22qHkNOZLj/l+wwZL01R7v2KmxCWOmuOnZveIQ5A4vfYzUu/7Wf4mFCPqE84XSJeyqE29pnc12rQl2+kCf+5YAeAszuniaLa6E/s/SwLDV9M0BMX3LaT43Ta075cEy5j/ErjRLJ/PVOEJkP/y4yY3at+KlXc4phWX/aj8Xc0U8AQv8Mh5239sG5sCYBsCRO/K20qg8fnMaEOs6aRaqJVAsQwRNdQKS60nbFr4ut0pXF387MeakpNduBdqBAEs8aZE0V/j6NQc33ASzFDCt/r/PZuykKp3g3P9ABL3c7LEMEZ7d5P5cdo14m0PFwQcwT9fCdJ5sUAb9tJOem5J/JFpw1f8/Y8ScHQ+ntEjFfig/6sKdRmzBq0e+kow9YKj5ztHZNpvfB997S6cfpnPxV2f8PWUMW9JNpsj+Fel1+ooV4CqP0x1y9ovUed8feQ3QOzeVuAKYkoELQR9+4nh5S8ht4DkAAA=";

function BlockChip({ n }: { n: number }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-0.5 align-baseline tabular-nums">
      {n}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BLOCK_ICON} alt={t("Block")} className="inline-block h-4 w-4 align-text-bottom" />
    </span>
  );
}

function PowerChip({ id, n }: { id: string; n?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-baseline tabular-nums">
      {powerLabel(id, n)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl(`/static/images/powers/${id.toLowerCase()}.webp`)}
        alt=""
        className="inline-block h-4 w-4 align-text-bottom"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </span>
  );
}

const STAR_ICON = "https://cdn.spire-codex.com/game/v0.110.0/assets/ui/combat/energy_star.webp";

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-baseline tabular-nums">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={STAR_ICON} alt="star" className="inline-block h-4 w-4 align-text-bottom" loading="lazy" />
      {n}
    </span>
  );
}

function Energy({ n, icon }: { n: number; icon: string }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-0.5 align-baseline tabular-nums">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl(`/static/images/icons/${icon}_energy_icon.webp`)} alt={t("energy")} className="inline-block h-4 w-4 align-text-bottom" loading="lazy" />
      {n}
    </span>
  );
}

function powerLabel(id: string, n: number | undefined): string {
  return `${displayName(id.replace(/_POWER$/, ""))}${n !== undefined ? ` ${n}` : ""}`;
}

function TurnBlock({ turn, cat, energyIcon, playerId }: { turn: ReplayTurn; cat: Catalog; energyIcon: string; playerId: string }) {
  const t = useT();
  const bp = useBetaPrefix();
  const cardPill = (key: string, id: string, up?: boolean): ReactNode =>
    withPill(t(key, { card: SLOT }), SLOT, <Card id={id} up={up} cat={cat} bp={bp} />);
  const items: ReactNode[] = [];
  const lines = turn.lines;
  const claimed = new Set<number>();
  const isSelf = (tgt: string | undefined) => !tgt || tgt === "player" || cleanId(tgt).toUpperCase() === playerId;
  const powerChange = (id: string, n: number | undefined, tgt: string | undefined): ReactNode => {
    const lost = n !== undefined && n < 0;
    const chip = <PowerChip id={id} n={lost ? -(n as number) : n} />;
    const power = SLOT;
    let text: string;
    if (isSelf(tgt)) text = lost ? t("Lost {power}", { power }) : turn.side === "player" ? t("Gained {power}", { power }) : t("{power} applied to you", { power });
    else {
      const monster = monsterName(tgt as string, cat);
      if (lost) text = t("{monster} lost {power}", { monster, power });
      else text = turn.side === "player" ? t("Applied {power} to {target}", { power, target: monster }) : t("{monster} gained {power}", { monster, power });
    }
    return withPill(text, SLOT, chip);
  };
  if (turn.side === "player") {
    const drawn = lines.flatMap((l) => (l.t === "draw" ? [l] : []));
    if (drawn.length) {
      items.push(
        <>
          {t("Drew")}:{" "}
          {drawn.map((l, i) => (
            <span key={`${l.s}-${i}`}>
              {i > 0 && ", "}
              <Card id={l.id} cat={cat} bp={bp} />
            </span>
          ))}
        </>,
      );
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      switch (l.t) {
        case "play": {
          const own: HitLine[] = [];
          for (let j = i + 1; j < lines.length && lines[j].t !== "play"; j++) {
            const h = lines[j];
            if (h.t === "hit" && h.src === "player" && (h.card ? h.card === l.id : true)) {
              own.push(h);
              claimed.add(j);
            }
          }
          const dmg = own.reduce((sum, h) => sum + (h.dmg ?? 0), 0);
          const killed = own.filter((h) => h.killed && h.dst).map((h) => monsterName(h.dst as string, cat));
          items.push(
            <>
              {t("Played")} <Card id={l.id} up={!!l.up} cat={cat} bp={bp} />
              {l.target && !isSelf(l.target) && <> → {monsterName(l.target, cat)}</>}
              {dmg > 0 && <>, {dmg} {t("damage")}</>}
              {killed.length > 0 && <>, {t("killed {who}", { who: killed.join(", ") })}</>}
              {l.costPaid !== undefined && <> · <Energy n={l.costPaid} icon={energyIcon} /></>}
              {l.starsPaid ? <> · <Stars n={l.starsPaid} /></> : null}
            </>,
          );
          break;
        }
        case "hit":
          if (!claimed.has(i) && l.dst && l.dst !== "player" && l.dmg) {
            items.push(t("{target} took {n} damage", { target: monsterName(l.dst, cat), n: l.dmg }));
          }
          break;
        case "block":
          if (l.n) {
            const card = l.card;
            items.push(
              <>
                {t("Block")} +<BlockChip n={l.n} />
                {card && (
                  <>
                    {" "}(<Card id={card} cat={cat} bp={bp} />)
                  </>
                )}
              </>,
            );
          }
          break;
        case "power":
          items.push(powerChange(l.id, l.n, l.tgt));
          break;
        case "potion_used":
          items.push(withPill(t("Used {potion}", { potion: SLOT }), SLOT, <Potion id={l.id} cat={cat} bp={bp} />));
          break;
        case "exhaust":
          items.push(cardPill("Exhausted {card}", l.id));
          break;
        case "generate":
          items.push(cardPill("Created {card}", l.id));
          break;
        case "hp":
          if (l.d) items.push(l.d > 0 ? t("Healed {n} HP", { n: l.d }) : t("Lost {n} HP", { n: -l.d }));
          break;
      }
    }
  } else {
    const generated = new Map<string, number>();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      switch (l.t) {
        case "hit": {
          if (l.dmg === undefined) break;
          if (l.dst === "player") {
            const src = l.src ?? "";
            const by = src === "effect" || !src ? t("An effect") : monsterName(src, cat);
            items.push(`${t("{monster} hit you for {n}", { monster: by, n: l.dmg })}${l.blocked ? ` (${l.blocked} ${t("blocked")})` : ""}`);
            for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
              const h = lines[j];
              if (h.t === "hp" && h.d === -l.dmg && !claimed.has(j)) {
                claimed.add(j);
                break;
              }
            }
          } else if (l.dst && l.dmg) {
            items.push(t("{target} took {n} damage", { target: monsterName(l.dst, cat), n: l.dmg }));
          }
          break;
        }
        case "power":
          items.push(powerChange(l.id, l.n, l.tgt));
          break;
        case "move":
          items.push(t("{monster} used {move}", { monster: monsterName(l.src, cat), move: moveName(l.src, l.id, cat) }));
          break;
        case "block":
          if (l.n && l.src && !isSelf(l.src) && l.src !== "effect") {
            items.push(withPill(t("{monster} gained {n} Block", { monster: monsterName(l.src, cat), n: SLOT }), SLOT, <BlockChip n={l.n} />));
          }
          break;
        case "generate":
          generated.set(l.id, (generated.get(l.id) ?? 0) + 1);
          break;
        case "end":
          items.push(l.terminalReason === "interrupted" ? t("The recording stopped here") : l.isGameOver ? t("You died here") : t("The run was left here"));
          break;
      }
    }
    for (const [id, n] of generated) {
      items.push(n > 1 ? withPill(t("Added {n} × {card} to your deck", { n, card: SLOT }), SLOT, <Card id={id} cat={cat} bp={bp} />) : cardPill("Added {card} to your deck", id));
    }
    lines.forEach((l, i) => {
      if (l.t === "hp" && l.d && !claimed.has(i)) items.push(l.d > 0 ? t("Healed {n} HP", { n: l.d }) : t("Lost {n} HP", { n: -l.d }));
    });
  }
  const hpLine = lines.findLast((l) => l.t === "hp");
  const player = turn.side === "player";
  const start = turn.side === "start";
  return (
    <li className="py-2">
      <div className="flex items-baseline gap-3">
        <span className={`text-xs font-semibold uppercase tracking-wider tabular-nums ${player ? "text-[var(--accent-gold)]" : start ? "text-[var(--text-muted)]" : "text-[var(--accent-red)]"}`}>
          {start ? t("Fight start") : `${player ? t("Turn") : t("Enemy")} ${turn.n}`}
        </span>
        {hpLine && <span className="text-xs tabular-nums text-[var(--text-muted)]">HP {hpLine.hp}</span>}
      </div>
      {items.length ? (
        <ol className="mt-1 list-decimal space-y-0.5 pl-6 text-sm text-[var(--text-secondary)] marker:text-xs marker:tabular-nums marker:text-[var(--text-muted)]">
          {items.map((it, i) => (
            <li key={i} className="pl-1">{it}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {turn.linesLost ? t("{n} lines missing here", { n: turn.linesLost }) : player ? t("Nothing recorded") : t("No enemy action recorded")}
        </p>
      )}
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

function CombatBlock({ c, label, cat, energyIcon, playerId }: { c: ReplayCombat; label?: string; cat: Catalog; energyIcon: string; playerId: string }) {
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
            {(c.supersededByRetry || c.rolledBackByReload) && (
              <>
                <span className="text-[var(--text-muted)]">{t("Undone by a reload, so this attempt did not stick")}</span>
                {" · "}
              </>
            )}
            {c.resumedAcrossReload && (
              <>
                <span className="text-[var(--text-muted)]">{t("Continued after a reload")}</span>
                {" · "}
              </>
            )}
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
          <TurnBlock key={`${tn.side}-${tn.n}-${i}`} turn={tn} cat={cat} energyIcon={energyIcon} playerId={playerId} />
        ))}
      </ol>
    </section>
  );
}

function LootLine({ f, cat, who }: { f: ReplayFloor; cat: Catalog; who: string }) {
  const t = useT();
  const chosen = new Set(f.decisions.flatMap((d) => d.options.filter((o) => o.chosen).flatMap((o) => [o.id, o.grantsRelic].filter((x): x is string => !!x))));
  const rewarded = new Set(f.decisions.flatMap((d) => d.resolutions.flatMap((r) => (r.t === "resolve" && r.id ? [r.id] : r.t === "relic" ? [r.id] : []))));
  const decided = new Set(
    f.decisions.flatMap((d) =>
      d.resolutions
        .filter((r) => r.t === "resolve" || ((r.t === "acquire" || r.t === "remove" || r.t === "upgrade") && chosen.has(r.id)) || (r.t === "transform" && chosen.has(r.fromId)) || (r.t === "relic" && (chosen.has(r.id) || rewarded.has(r.id))))
        .map((r) => r.s),
    ),
  );
  const restHeal = f.lines.find((l) => l.t === "rest" && l.option === "heal");
  const heals = restHeal ? f.lines.filter((l) => l.t === "hp" && (l.d ?? 0) > 0 && (l.src === undefined || l.src === "heal")) : [];
  const healLine = heals.findLast((l) => l.s < restHeal!.s) ?? heals[0];
  const bp = useBetaPrefix();
  const counts = new Map<string, { node: ReactNode; n: number }>();
  for (const l of f.lines) {
    if (decided.has(l.s)) continue;
    if (isShopKind(f.kind) && (l.t === "buy" || l.t === "remove" || l.t === "acquire")) continue;
    if (l.t === "resume" || l.t === "hp_loss") continue;
    if (l.t === "potion_got" && rewarded.has(l.id)) continue;
    if (f.combats.length && l.t === "hp") continue;
    if (l === healLine) continue;
    const d = describeLine(l, cat, t, who, bp, l === restHeal && healLine?.t === "hp" ? healLine.d : undefined);
    if (!d) continue;
    const hit = counts.get(d.key);
    if (hit) hit.n += 1;
    else counts.set(d.key, { node: d.node, n: 1 });
  }
  if (!counts.size) return null;
  return (
    <ol className="list-decimal space-y-0.5 pl-6 text-sm text-[var(--text-secondary)] marker:text-xs marker:tabular-nums marker:text-[var(--text-muted)]">
      {[...counts].map(([key, { node, n }]) => (
        <li key={key} className="pl-1">
          {node}
          {n > 1 ? ` ×${n}` : ""}
        </li>
      ))}
    </ol>
  );
}

export default function FloorPanel({
  f,
  prev,
  cat,
  maxHp,
  who,
  energyIcon,
  playerId,
  recordingEndsHere,
}: {
  f: ReplayFloor;
  prev?: ReplayFloor;
  cat: Catalog;
  maxHp?: number;
  who: string;
  energyIcon: string;
  playerId: string;
  recordingEndsHere?: boolean;
}) {
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
      {f.linesLost > 0 && (
        <p className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]">
          {t("{n} lines from this floor are missing from the record, so something here went unrecorded.", { n: f.linesLost })}
        </p>
      )}
      {f.combats.map((c, i) => (
        <CombatBlock key={`${c.combatId ?? c.encounter}-${i}`} c={c} label={combatNames[i]} cat={cat} energyIcon={energyIcon} playerId={playerId} />
      ))}
      {isShopKind(f.kind) && <ShopBlock f={f} prev={prev} cat={cat} />}
      {visibleDecisions.map((d) => (
        <DecisionCard key={d.id} d={d} cat={cat} who={who} />
      ))}
      <LootLine f={f} cat={cat} who={who} />
      {!f.combats.length && !f.decisions.length && !f.lines.some((l) => ["relic", "acquire", "potion_got", "upgrade", "remove", "transform", "rest", "buy"].includes(l.t)) && (
        <p className="text-sm text-[var(--text-muted)]">
          {recordingEndsHere ? t("The recording ends on this floor, so what happened here was never written.") : t("Nothing else was recorded on this floor.")}
        </p>
      )}
      {recordingEndsHere && f.lines.some((l) => ["relic", "acquire", "potion_got", "upgrade", "remove", "transform", "rest", "buy"].includes(l.t)) && (
        <p className="text-sm text-[var(--text-muted)]">{t("The recording ends on this floor.")}</p>
      )}
    </div>
  );
}
