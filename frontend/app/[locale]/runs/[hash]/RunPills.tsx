"use client";

import { useGameLocale, useGameTranslations } from "@/lib/i18n";
import { Ref, useContext, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import RichDescription from "@/app/components/RichDescription";
import { imageUrl, fullCardUrl, enchantedCardUrl } from "@/lib/image-url";
import { useBetaPrefix, useChannel } from "@/lib/use-lang-prefix";
import {
  CardsContext,
  EnchantmentsContext,
  RelicsContext,
  PotionsContext,
} from "@/app/contexts/api";

export function CardPill({
  cardId,
  upgraded,
  enchantmentId,
  className,
  children,
}: {
  cardId: string;
  upgraded?: boolean;
  enchantmentId?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [above, setAbove] = useState(true);
  const cards = useContext(CardsContext);
  const enchantments = useContext(EnchantmentsContext);
  const ref = useRef<HTMLElement>(null);
  const lang = useGameLocale();
  const card = cards?.[cardId];
  const enchantment = enchantmentId && enchantments?.[enchantmentId];
  const gT = useGameTranslations();
  const bp = useBetaPrefix();
  const channel = useChannel();
  if (cards && enchantments) {
    const rootArgs = {
      className: `relative ${className || ""}`,
      onMouseEnter() {
        // Flip the card preview below when there isn't room above (small
        // screens / cards near the top, e.g. the deck modal on the live page).
        setAbove((ref.current?.getBoundingClientRect().top ?? 999) > 240);
        setShow(true);
      },
      onMouseLeave: () => setShow(false),
    };

    const content = (
      <>
        {children ?? (
          <>
            {card ? gT(`cards.${cardId}.title`) : cardId}
            {upgraded && "+"}
            {enchantmentId && (
              <span className="text-[var(--color-necrobinder)] ml-1">
                {enchantment
                  ? gT(`enchantments.${enchantmentId}.title`)
                  : enchantmentId}
              </span>
            )}
          </>
        )}
        {show && (
          // Pop the full rendered card (enchanted and/or upgraded variant when
          // the run says so) instead of the text tooltip. Falls back from the
          // enchanted render to the plain one, then to the beta render (cards
          // that only exist on the beta channel yet), then to the portrait art.
          <span
            className={`pointer-events-none absolute z-50 left-1/2 w-40 -translate-x-1/2 ${
              above ? "bottom-full mb-2" : "top-full mt-2"
            }`}
          >
            <img
              src={
                card
                  ? enchantmentId
                    ? enchantedCardUrl(
                        cardId.toLowerCase(),
                        enchantment ? enchantmentId : "deprecated_enchantment",
                        upgraded,
                        channel,
                        lang,
                      )
                    : fullCardUrl(cardId.toLowerCase(), upgraded, channel, lang)
                  : imageUrl(
                      `/static/images/potions/deprecated_potion.webp`,
                    ) /* fallbackfrom a potion */
              }
              alt=""
              className="w-40 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
              crossOrigin="anonymous"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                const chain = [
                  fullCardUrl(cardId.toLowerCase(), upgraded, "stable", lang),
                  fullCardUrl(cardId.toLowerCase(), upgraded, "beta", lang),
                  ...(card?.image_url ? [imageUrl(card.image_url)] : []),
                ];
                // The enchanted src isn't in the chain, so its failure lands on
                // the plain render (indexOf -1 + 1 = 0).
                const next = chain[chain.indexOf(el.src) + 1];
                if (next) el.src = next;
                else el.style.visibility = "hidden";
              }}
            />
          </span>
        )}
      </>
    );
    return card ? (
      <Link
        href={`${bp}/cards/${cardId.toLowerCase()}`}
        ref={ref as Ref<HTMLAnchorElement | null>}
        {...rootArgs}
      >
        {content}
      </Link>
    ) : (
      <div ref={ref as Ref<HTMLDivElement>} {...rootArgs}>
        {content}
      </div>
    );
  }
}

export function RelicPill({
  relicId,
  className,
  children,
}: {
  relicId: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const relics = useContext(RelicsContext);
  const gT = useGameTranslations();
  const bp = useBetaPrefix();
  if (relics) {
    const relic = relics[relicId];
    const name = relic ? gT(`relics.${relicId}.title`) : relicId;

    return (
      <Link
        href={`${bp}/relics/${relicId.toLowerCase()}`}
        className={`relative ${className || ""}`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children ?? name}
        {show && relic && (
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
            <div className="flex items-start gap-2 mb-1.5">
              {relic.image_url && (
                <img
                  src={imageUrl(relic.image_url)}
                  alt=""
                  className="w-8 h-8 object-contain"
                  crossOrigin="anonymous"
                />
              )}
              <div className="min-w-0">
                <div className="font-semibold text-xs text-[var(--text-primary)] truncate">
                  {name}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {relic &&
                    gT(
                      `gameplay_ui.RELIC_RARITY.${relic.rarity_key?.toUpperCase()}`,
                    )}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
              <RichDescription
                text={
                  /* we can't use description messages yet as I haven't translated them */
                  /*                  relic
                    ? gT(`relics.${relicId}.description`)
                    : gT(`relics.DEPRECATED_RELIC.description`) */
                  relic.description
                }
              />
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
          </div>
        )}
      </Link>
    );
  }
}

export function PotionPill({
  potionId,
  className,
  children,
}: {
  potionId: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const potions = useContext(PotionsContext);
  const bp = useBetaPrefix();
  const potion = potions?.[potionId];
  const gT = useGameTranslations({ namespace: "potions" });
  const name = potion ? gT(`${potionId}.title`) : potionId;

  const content = (
    <>
      {children ?? name}
      {show && potion && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            <img
              src={imageUrl(
                potion?.image_url ??
                  `/static/images/potions/deprecated_potion.webp`,
              )}
              alt={name}
              className="w-8 h-8 object-contain"
              crossOrigin="anonymous"
            />
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">
                {name}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {potion && gT(`gameplay_ui.POTION_RARITY_${potion.rarity}`)}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription
              text={
                potion
                  ? gT(`${potionId}.description`)
                  : gT(`DEPRECATED_POTION.description`)
              }
            />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </>
  );
  if (potion) {
    return (
      <Link
        href={`${bp}/potions/${potionId.toLowerCase()}`}
        className={`relative ${className || ""}`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {content}
      </Link>
    );
  } else {
    return (
      <div
        className={`relative ${className || ""}`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {content}
      </div>
    );
  }
}
