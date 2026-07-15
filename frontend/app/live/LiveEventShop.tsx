"use client";

// Live current-screen detail (v4): what the player sees on the event and shop
// screens. Event text is localized by the mod and carries the game's BBCode
// tags ([gold]/[sine]/[jitter]/...), rendered via RichDescriptionSimple.
// Shop item ids resolve to names/images through the run-page pills (hover shows
// the full card / relic tooltip). Contract: markdown-docs/live-presence.md (v4).

import Link from "next/link";
import { imageUrl } from "@/lib/image-url";
import { RichDescriptionSimple } from "@/app/components/RichDescription";
import {
  CardPill,
  PotionPill,
  RelicPill,
  cleanId,
  displayName,
  type CardInfo,
  type PotionInfo,
  type RelicInfo,
} from "../runs/[hash]/RunPills";
import {
  LiveCardImg,
  parseDeckId,
  safeId,
  withOrdinalKeys,
  type LiveEventCtx,
  type LiveLoot,
  type LiveShop,
  type ShopItem,
} from "./live-shared";

function Gold({ cost }: { cost?: number }) {
  if (cost == null) return null;
  return <span className="text-[var(--accent-gold)] tabular-nums font-semibold">{cost}g</span>;
}

export function LiveEventPanel({
  ev,
  lp,
  cards,
  relics,
}: {
  ev: LiveEventCtx;
  lp: string;
  cards?: Record<string, CardInfo>;
  relics?: Record<string, RelicInfo>;
}) {
  const id = cleanId(ev.id);
  const titleText = ev.title || displayName(`EVENT.${id}`);
  return (
    <div className="rounded-lg border border-purple-900/50 bg-purple-950/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Event</span>
        {safeId(id) ? (
          <Link
            href={`${lp}/events/${id.toLowerCase()}`}
            className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent-gold)]"
          >
            {titleText}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-[var(--text-primary)]">{titleText}</span>
        )}
      </div>
      {ev.prompt && (
        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line mb-3 leading-relaxed">
          <RichDescriptionSimple text={ev.prompt} />
        </p>
      )}
      {(ev.options?.length ?? 0) > 0 && (
        <ul className="space-y-1.5">
          {withOrdinalKeys((ev.options ?? []).map((o, i) => o.key || o.text || String(i))).map(
            ({ key }, i) => {
              const o = (ev.options ?? [])[i];
              const disabled = o.locked;
              return (
                <li
                  key={key}
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                    o.chosen
                      ? "border-[var(--accent-gold)]/50 bg-[var(--accent-gold)]/10 text-[var(--text-primary)]"
                      : disabled
                        ? "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-muted)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {o.chosen ? "✓" : disabled ? "\u{1F512}" : "•"}
                  </span>
                  <span className={`min-w-0 flex-1 ${disabled ? "line-through" : ""}`}>
                    {o.text ? <RichDescriptionSimple text={o.text} /> : o.key || "(option)"}
                    {o.desc && o.desc !== o.text && (
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        <RichDescriptionSimple text={o.desc} />
                      </span>
                    )}
                    {(o.card || o.relic) && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        {o.card && (
                          <CardPill
                            cardId={cleanId(o.card)}
                            cardData={cards ?? {}}
                            lp={lp}
                            className="block w-16 shrink-0"
                          >
                            <LiveCardImg
                              id={cleanId(o.card)}
                              alt=""
                              className="w-16 rounded shadow"
                              portrait={cards?.[cleanId(o.card)]?.image_url}
                            />
                          </CardPill>
                        )}
                        {o.relic && (
                          <RelicPill
                            relicId={cleanId(o.relic)}
                            relicData={relics ?? {}}
                            lp={lp}
                            className="block shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrl(
                                relics?.[cleanId(o.relic)]?.image_url ||
                                  `/static/images/relics/${cleanId(o.relic).toLowerCase()}.png`,
                              )}
                              alt=""
                              className="h-9 w-9 object-contain"
                              crossOrigin="anonymous"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </RelicPill>
                        )}
                      </span>
                    )}
                  </span>
                  {o.proceed && !o.chosen && (
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">leave</span>
                  )}
                </li>
              );
            },
          )}
        </ul>
      )}
    </div>
  );
}

function ShopSection({
  title,
  items,
  kind,
  cards,
  relics,
  potions,
  lp,
}: {
  title: string;
  items: ShopItem[];
  kind: "card" | "relic" | "potion";
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  lp: string;
}) {
  const real = items.filter((it) => it.id);
  if (real.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{title}</div>
      <ul className="space-y-1">
        {withOrdinalKeys(real.map((it) => it.id as string)).map(({ key }, idx) => {
          const it = real[idx];
          const rawId = it.id as string;
          const { id, upgraded } = parseDeckId(rawId);
          const sold = it.stocked === false;
          const info =
            kind === "card" ? cards[id] : kind === "relic" ? relics[id] : potions[id];
          const name = info?.name || displayName(`${kind.toUpperCase()}.${id}`);
          const portrait = info?.image_url ? imageUrl(info.image_url) : "";
          const thumb =
            kind === "card" ? (
              <LiveCardImg
                id={id}
                upgraded={upgraded}
                alt={name}
                className="w-7 h-auto rounded-sm"
                portrait={info?.image_url}
              />
            ) : (
              <img
                src={
                  portrait ||
                  imageUrl(`/static/images/${kind === "relic" ? "relics" : "potions"}/${id.toLowerCase()}.png`)
                }
                alt={name}
                className="w-7 h-7 object-contain"
                crossOrigin="anonymous"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            );
          const pill =
            kind === "card" ? (
              <CardPill cardId={id} upgraded={upgraded} cardData={cards} lp={lp} className="block shrink-0">
                {thumb}
              </CardPill>
            ) : kind === "relic" ? (
              <RelicPill relicId={id} relicData={relics} lp={lp} className="block shrink-0">
                {thumb}
              </RelicPill>
            ) : (
              <PotionPill potionId={id} potionData={potions} lp={lp} className="block shrink-0">
                {thumb}
              </PotionPill>
            );
          return (
            <li key={key} className={`flex items-center gap-2 ${sold ? "opacity-40" : ""}`}>
              {pill}
              <span className={`text-sm min-w-0 flex-1 truncate ${sold ? "line-through" : "text-[var(--text-secondary)]"}`}>
                {name}
                {upgraded ? "+" : ""}
              </span>
              {it.on_sale && !sold && (
                <span className="text-[9px] font-bold uppercase rounded bg-emerald-600 px-1 text-white shrink-0">
                  sale
                </span>
              )}
              {sold ? (
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">sold</span>
              ) : (
                <Gold cost={it.cost} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LiveShopPanel({
  shop,
  cards,
  relics,
  potions,
  lp,
}: {
  shop: LiveShop;
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  lp: string;
}) {
  const removal = shop.removal;
  return (
    <div className="rounded-lg border border-[var(--accent-gold)]/30 bg-[var(--bg-card)] p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-gold)]">
        Shop
      </div>
      <ShopSection title="Cards" items={shop.cards ?? []} kind="card" cards={cards} relics={relics} potions={potions} lp={lp} />
      <ShopSection title="Relics" items={shop.relics ?? []} kind="relic" cards={cards} relics={relics} potions={potions} lp={lp} />
      <ShopSection title="Potions" items={shop.potions ?? []} kind="potion" cards={cards} relics={relics} potions={potions} lp={lp} />
      {removal && removal.cost != null && (
        <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
          <span className={`text-sm flex-1 ${removal.stocked === false ? "text-[var(--text-muted)] line-through" : "text-[var(--text-secondary)]"}`}>
            Card removal
          </span>
          {removal.stocked === false ? (
            <span className="text-[10px] text-[var(--text-muted)]">used</span>
          ) : (
            <Gold cost={removal.cost} />
          )}
        </div>
      )}
    </div>
  );
}

/** The combat/reward-screen loot: gold plus the cards (full renders), relics,
 * and potions on offer, each with the run-page hover tooltip. Potions on top,
 * cards + relics below. */
export function LiveLootPanel({
  loot,
  cards,
  relics,
  potions,
  lp,
}: {
  loot: LiveLoot;
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  lp: string;
}) {
  const cardIds = loot.cards ?? [];
  const relicIds = loot.relics ?? [];
  const potionIds = loot.potions ?? [];
  const packs = loot.packs ?? [];
  const hasGold = loot.gold != null && loot.gold > 0;
  const removal = !!loot.card_removal;
  if (
    !cardIds.length &&
    !relicIds.length &&
    !potionIds.length &&
    !packs.length &&
    !hasGold &&
    !removal
  ) {
    return null;
  }
  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          Rewards
        </span>
        {hasGold && (
          <span className="text-sm font-semibold tabular-nums text-[var(--accent-gold)]">
            {loot.gold}g
          </span>
        )}
      </div>
      {potionIds.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {withOrdinalKeys(potionIds).map(({ item, key }) => {
            const id = cleanId(item);
            const info = potions[id];
            return (
              <PotionPill
                key={`p-${key}`}
                potionId={id}
                potionData={potions}
                lp={lp}
                className="block shrink-0"
              >
                {info?.image_url ? (
                  <img
                    src={imageUrl(info.image_url)}
                    alt={info.name}
                    className="h-9 w-9 object-contain"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {displayName(`POTION.${id}`)}
                  </span>
                )}
              </PotionPill>
            );
          })}
        </div>
      )}
      {packs.length > 0 && (
        <div className="space-y-2">
          {packs.map((pack, pi) => (
            <div key={`pack-${pi}`}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-300/80">
                Pack {pi + 1}
              </div>
              <div className="flex flex-wrap items-start gap-1.5">
                {withOrdinalKeys(pack).map(({ item, key }) => {
                  const { id, upgraded } = parseDeckId(item);
                  return (
                    <CardPill
                      key={`pk${pi}-${key}`}
                      cardId={id}
                      upgraded={upgraded}
                      cardData={cards}
                      lp={lp}
                      className="relative block w-16 shrink-0"
                    >
                      <LiveCardImg
                        id={id}
                        upgraded={upgraded}
                        alt={cards[id]?.name || displayName(`CARD.${id}`)}
                        className="h-auto w-16 rounded-sm"
                        portrait={cards[id]?.image_url}
                      />
                    </CardPill>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {((!packs.length && cardIds.length > 0) || relicIds.length > 0) && (
        <div className="flex flex-wrap items-start gap-1.5">
          {!packs.length &&
            withOrdinalKeys(cardIds).map(({ item, key }) => {
            const { id, upgraded } = parseDeckId(item);
            return (
              <CardPill
                key={`c-${key}`}
                cardId={id}
                upgraded={upgraded}
                cardData={cards}
                lp={lp}
                className="relative block w-16 shrink-0"
              >
                <LiveCardImg
                  id={id}
                  upgraded={upgraded}
                  alt={cards[id]?.name || displayName(`CARD.${id}`)}
                  className="h-auto w-16 rounded-sm"
                  portrait={cards[id]?.image_url}
                />
              </CardPill>
            );
          })}
          {withOrdinalKeys(relicIds).map(({ item, key }) => {
            const id = cleanId(item);
            const info = relics[id];
            return (
              <RelicPill
                key={`r-${key}`}
                relicId={id}
                relicData={relics}
                lp={lp}
                className="block shrink-0"
              >
                {info?.image_url ? (
                  <img
                    src={imageUrl(info.image_url)}
                    alt={info.name}
                    className="h-9 w-9 object-contain"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {displayName(`RELIC.${id}`)}
                  </span>
                )}
              </RelicPill>
            );
          })}
        </div>
      )}
      {removal && (
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Card removal available
        </div>
      )}
    </div>
  );
}
