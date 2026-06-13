"use client";

// Live current-screen detail (v4): what the player sees on the event and shop
// screens. The event text is already localized by the mod, so it renders as-is.
// Shop item ids resolve to names/images through the run-page pills (hover shows
// the full card / relic tooltip). Contract: markdown-docs/live-presence.md (v4).

import Link from "next/link";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
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
  parseDeckId,
  safeId,
  withOrdinalKeys,
  type LiveEventCtx,
  type LiveShop,
  type ShopItem,
} from "./live-shared";

function Gold({ cost }: { cost?: number }) {
  if (cost == null) return null;
  return <span className="text-[var(--accent-gold)] tabular-nums font-semibold">{cost}g</span>;
}

export function LiveEventPanel({ ev, lp }: { ev: LiveEventCtx; lp: string }) {
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
          {ev.prompt}
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
                    {o.text || o.key || "(option)"}
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
  lang,
}: {
  title: string;
  items: ShopItem[];
  kind: "card" | "relic" | "potion";
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  lp: string;
  lang: string;
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
              <img
                src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                alt={name}
                className="w-7 h-auto rounded-sm"
                crossOrigin="anonymous"
                loading="lazy"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  if (portrait && el.src !== portrait) el.src = portrait;
                  else el.style.visibility = "hidden";
                }}
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
  lang,
}: {
  shop: LiveShop;
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  lp: string;
  lang: string;
}) {
  const removal = shop.removal;
  return (
    <div className="rounded-lg border border-[var(--accent-gold)]/30 bg-[var(--bg-card)] p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-gold)]">
        Shop
      </div>
      <ShopSection title="Cards" items={shop.cards ?? []} kind="card" cards={cards} relics={relics} potions={potions} lp={lp} lang={lang} />
      <ShopSection title="Relics" items={shop.relics ?? []} kind="relic" cards={cards} relics={relics} potions={potions} lp={lp} lang={lang} />
      <ShopSection title="Potions" items={shop.potions ?? []} kind="potion" cards={cards} relics={relics} potions={potions} lp={lp} lang={lang} />
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
