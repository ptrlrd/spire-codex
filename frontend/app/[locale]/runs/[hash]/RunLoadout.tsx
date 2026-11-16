"use client";

import CardImage from "@/app/components/CardImage";
import type { Player } from "@/lib/api/run/types";
import { stackCards, type StackEntry } from "@/lib/deck-stack";
import { useTryGameTranslations } from "@/lib/game-i18n";
import { useT, type TFn } from "@/lib/i18n";
import { imageUrl } from "@/lib/image-url";
import {
  CardPill,
  PotionPill,
  RelicPill,
  displayName,
  type CardInfo,
  type PotionInfo,
  type RelicInfo,
} from "./RunPills";

const RARITY_ORDER = [
  "Starter",
  "Common",
  "Uncommon",
  "Rare",
  "Shop",
  "Ancient",
  "Event",
  "Token",
  "Status",
  "Curse",
  "Quest",
];

const TYPE_ORDER = ["Attack", "Skill", "Power", "Curse", "Status", "Quest"];

const PANEL =
  "bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 sm:p-5 mb-4";

function cardLabelColor(upgraded: boolean, enchanted: boolean): string {
  if (enchanted) return "text-[var(--color-necrobinder)]";
  if (upgraded) return "text-[var(--color-silent)]";
  return "text-[var(--text-primary)]";
}

interface Rated {
  rarity?: string;
  rarity_key?: string | null;
}

function raritySummary<T>(
  items: T[],
  getInfo: (item: T) => Rated | undefined,
  t: TFn,
): string {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const info = getInfo(item);
    const key = info?.rarity_key ?? info?.rarity ?? "Unknown";
    const r = key === "Basic" ? "Starter" : key;
    buckets.set(r, (buckets.get(r) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const r of RARITY_ORDER) {
    const n = buckets.get(r);
    if (n) parts.push(`${n} ${t(r)}`);
  }
  return parts.join(", ");
}

function SectionHead({
  title,
  count,
  summary,
}: {
  title: string;
  count: number | string;
  summary?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {title} ({count})
      </h2>
      {summary && <p className="text-sm text-[var(--text-muted)]">{summary}</p>}
    </div>
  );
}

const ITEM =
  "flex items-center gap-2.5 min-h-11 rounded-lg px-1.5 py-1 hover:bg-[var(--bg-card-hover)] transition-colors";

export function RunRelics({
  player,
  relicData,
  potionData,
  bp,
}: {
  player: Player;
  relicData: Record<string, RelicInfo>;
  potionData: Record<string, PotionInfo>;
  bp: string;
}) {
  const t = useT();
  const gt = useTryGameTranslations();
  const total = player.max_potion_slot_count ?? 3;
  const potions = player.potions ?? [];
  const slots: ((typeof potions)[number] | null)[] = Array(total).fill(null);
  const loose: typeof potions = [];
  for (const p of potions) {
    if (p.slot_index >= 0 && p.slot_index < total && !slots[p.slot_index])
      slots[p.slot_index] = p;
    else loose.push(p);
  }
  for (const p of loose) {
    const free = slots.indexOf(null);
    if (free >= 0) slots[free] = p;
  }
  return (
    <section className={PANEL}>
      <SectionHead
        title={t("Relics")}
        count={player.relics.length}
        summary={raritySummary(player.relics, (r) => relicData[r.id], t)}
      />
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
        {player.relics.map((relic, i) => {
          const info = relicData[relic.id];
          const name =
            gt(`relics.${relic.id}.title`) ??
            info?.name ??
            displayName(`RELIC.${relic.id}`);
          return (
            <li key={`${relic.id}-${i}`} className="min-w-0">
              <RelicPill
                relicId={relic.id}
                relicData={relicData}
                bp={bp}
                className={ITEM}
              >
                <span className="w-9 h-9 flex-shrink-0 rounded-md bg-scrim/30 flex items-center justify-center">
                  {info?.image_url && (
                    <img
                      src={imageUrl(info.image_url)}
                      alt=""
                      className="w-full h-full object-contain p-0.5"
                      crossOrigin="anonymous"
                      loading="lazy"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--text-primary)]">
                    {name}
                  </span>
                  {relic.floor_added_to_deck != null && (
                    <span className="block text-xs text-[var(--text-muted)]">
                      {t("Floor {n}", { n: relic.floor_added_to_deck })}
                    </span>
                  )}
                </span>
              </RelicPill>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-5 mb-2 text-lg font-semibold text-[var(--text-primary)]">
        {t("Potions")} ({potions.length}/{total})
      </h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
        {slots.map((p, i) => {
          if (!p)
            return (
              <li key={i} className="flex items-center min-h-11 px-1.5">
                <span className="w-9 h-9 rounded-md border border-dashed border-[var(--border-subtle)]" />
              </li>
            );
          const info = potionData[p.id];
          const name =
            gt(`potions.${p.id}.title`) ??
            info?.name ??
            displayName(`POTION.${p.id}`);
          return (
            <li key={i} className="min-w-0">
              <PotionPill
                potionId={p.id}
                potionData={potionData}
                bp={bp}
                className={ITEM}
              >
                <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center">
                  {info?.image_url && (
                    <img
                      src={imageUrl(info.image_url)}
                      alt=""
                      className="w-full h-full object-contain"
                      crossOrigin="anonymous"
                      loading="lazy"
                    />
                  )}
                </span>
                <span className="min-w-0 truncate text-sm text-[var(--text-primary)]">
                  {name}
                </span>
              </PotionPill>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RunDeck({
  player,
  cardData,
  bp,
}: {
  player: Player;
  cardData: Record<string, CardInfo>;
  bp: string;
}) {
  const t = useT();
  const gt = useTryGameTranslations();
  const stacks = stackCards(player.deck, cardData, (id) =>
    gt(`cards.${id}.title`),
  );
  const loaded = Object.keys(cardData).length > 0;
  const groups = new Map<string, StackEntry[]>();
  const labels = new Map<string, string>();
  for (const entry of stacks) {
    const info = cardData[entry.id];
    const type = info?.type_key ?? info?.type;
    if (type && info?.type) labels.set(type, info.type);
    const key = !loaded
      ? ""
      : type && TYPE_ORDER.includes(type)
        ? type
        : "Other";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const ordered = ["", ...TYPE_ORDER, "Other"].filter((k) => groups.has(k));
  return (
    <section className={PANEL}>
      <SectionHead
        title={t("Final Deck")}
        count={player.deck.length}
        summary={raritySummary(player.deck, (c) => cardData[c.id], t)}
      />
      {ordered.map((type) => {
        const entries = groups.get(type) ?? [];
        const copies = entries.reduce((sum, e) => sum + e.count, 0);
        return (
          <div key={type} className="mt-4 first:mt-0">
            {type && (
              <h3 className="mb-2 flex items-baseline gap-2 text-base font-semibold text-[var(--text-primary)]">
                {labels.get(type) ?? t(type)}
                <span className="text-sm font-normal text-[var(--text-muted)]">
                  {copies}
                </span>
              </h3>
            )}
            <ul className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-x-2 gap-y-3">
              {entries.map((entry) => {
                const info = cardData[entry.id];
                const name =
                  gt(`cards.${entry.id}.title`) ??
                  info?.name ??
                  displayName(`CARD.${entry.id}`);
                const enchantName = entry.enchantment
                  ? (gt(`enchantments.${entry.enchantment}.title`) ??
                    displayName(`ENCHANTMENT.${entry.enchantment}`))
                  : undefined;
                return (
                  <li
                    key={`${entry.id}-${entry.upgraded ? "u" : "n"}-${entry.enchantment ?? ""}`}
                    className="min-w-0"
                  >
                    <CardPill
                      cardId={entry.id}
                      upgraded={entry.upgraded}
                      enchantment={entry.enchantment}
                      cardData={cardData}
                      bp={bp}
                      className="block rounded-lg p-1 hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <span className="relative block">
                        <span className="block overflow-hidden">
                          <CardImage
                            id={entry.id}
                            upgraded={entry.upgraded}
                            enchantment={entry.enchantment}
                            art={info?.image_url}
                            alt=""
                            className="block w-full h-auto scale-[1.22]"
                            fallbackClassName="w-full"
                          />
                        </span>
                        {entry.count > 1 && (
                          <span className="absolute -top-1 -right-1 min-w-7 rounded-full border border-[var(--accent-gold)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-center text-sm font-bold leading-none text-[var(--accent-gold)]">
                            {entry.count}x
                          </span>
                        )}
                      </span>
                      <span
                        className={`mt-1 block text-center text-xs leading-tight break-words ${cardLabelColor(entry.upgraded, !!entry.enchantment)}`}
                      >
                        {name}
                        {entry.upgraded && "+"}
                        {enchantName && (
                          <span className="block">[{enchantName}]</span>
                        )}
                      </span>
                    </CardPill>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
