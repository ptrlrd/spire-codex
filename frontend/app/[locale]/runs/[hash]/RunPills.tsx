"use client";

import { useGameLocale } from "@/lib/i18n";
import { useContext, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import RichDescription from "@/app/components/RichDescription";
import { imageUrl, fullCardUrl, enchantedCardUrl } from "@/lib/image-url";
import RelicsContext from "@/app/contexts/api/Relics";
import CardsContext from "@/app/contexts/api/Cards";
import { useCleanLocalize } from "./cleanLocalize";
import PotionsContext from "@/app/contexts/api/Potions";
import { cleanId } from "@/lib/display-name";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface CardInfo {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  cost: number;
  color: string;
  image_url: string | null;
}

export interface RelicInfo {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_url: string | null;
}

export interface PotionInfo {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_url: string | null;
}

export function CardPill({
  cardId,
  upgraded,
  enchantment,
  bp,
  className,
  children,
}: {
  cardId: string;
  upgraded?: boolean;
  enchantment?: string;
  bp: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [above, setAbove] = useState(true);
  const cards = useContext(CardsContext);
  const cleanT = useCleanLocalize();
  const ref = useRef<HTMLAnchorElement>(null);
  const lang = useGameLocale();
  console.log(cardId);
  const card = cards?.[cardId];
  return (
    <Link
      ref={ref}
      href={`${bp}/cards/${cardId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => {
        // Flip the card preview below when there isn't room above (small
        // screens / cards near the top, e.g. the deck modal on the live page).
        setAbove((ref.current?.getBoundingClientRect().top ?? 999) > 240);
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? (
        <>
          {cleanT((id) => `cards.${id}.name`, cardId)}
          {upgraded && "+"}
          {enchantment && (
            <span className="text-[var(--color-necrobinder)] ml-1">
              {cleanT((id) => `enchantments.${id}.name`, enchantment)}
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
              enchantment
                ? enchantedCardUrl(
                    cardId.toLowerCase(),
                    enchantment,
                    upgraded,
                    "stable",
                    lang,
                  )
                : fullCardUrl(cardId.toLowerCase(), upgraded, "stable", lang)
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
    </Link>
  );
}

export function RelicPill({
  relicId,
  bp,
  className,
  children,
}: {
  relicId: string;
  bp: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const relics = useContext(RelicsContext);
  const cleanT = useCleanLocalize({ namespace: "relics" });
  if (relics) {
    const info = relics[cleanId(relicId)];
    const name = cleanT((id) => `${id}.name`, relicId);

    return (
      <Link
        href={`${bp}/relics/${relicId.toLowerCase()}`}
        className={`relative ${className || ""}`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children ?? name}
        {show && info && (
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
            <div className="flex items-start gap-2 mb-1.5">
              {info.image_url && (
                <img
                  src={imageUrl(info.image_url)}
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
                  {cleanT((id) => `${id}.rarity`, relicId)}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
              <RichDescription
                text={cleanT((id) => `${id}.description`, relicId)}
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
  bp,
  className,
  children,
}: {
  potionId: string;
  bp: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const potions = useContext(PotionsContext);
  const cleanT = useCleanLocalize({ namespace: "potions" });
  const info = potions?.[potionId];
  const name = cleanT((id) => `${id}.name`, potionId);
  return (
    <Link
      href={`${bp}/potions/${potionId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? name}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img
                src={imageUrl(info.image_url)}
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
                {cleanT((id) => `${id}.rarity`, potionId)}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription
              text={cleanT((id) => `${id}.description`, potionId)}
            />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}
