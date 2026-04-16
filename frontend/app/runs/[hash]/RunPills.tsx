"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import RichDescription from "@/app/components/RichDescription";

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

export function cleanId(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION|EVENT)\./, "");
}

export function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CardPill({
  cardId,
  upgraded,
  enchantment,
  cardData,
  lp,
  className,
  children,
}: {
  cardId: string;
  upgraded?: boolean;
  enchantment?: string;
  cardData: Record<string, CardInfo>;
  lp: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = cardData[cardId];
  return (
    <Link
      href={`${lp}/cards/${cardId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? (
        <>
          {info?.name || displayName(`CARD.${cardId}`)}
          {upgraded && "+"}
          {enchantment && (
            <span className="text-[var(--color-necrobinder)] ml-1">
              [{displayName(`ENCHANTMENT.${enchantment}`)}]
            </span>
          )}
        </>
      )}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img
                src={`${API}${info.image_url}`}
                alt=""
                className="w-10 h-10 object-cover rounded"
                crossOrigin="anonymous"
              />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">
                {info.name}
                {upgraded && "+"}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {info.type} · {info.rarity} · {info.cost}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

export function RelicPill({
  relicId,
  relicData,
  lp,
  className,
  children,
}: {
  relicId: string;
  relicData: Record<string, RelicInfo>;
  lp: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = relicData[relicId];
  return (
    <Link
      href={`${lp}/relics/${relicId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? info?.name ?? displayName(`RELIC.${relicId}`)}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img
                src={`${API}${info.image_url}`}
                alt=""
                className="w-8 h-8 object-contain"
                crossOrigin="anonymous"
              />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

export function PotionPill({
  potionId,
  potionData,
  lp,
  className,
  children,
}: {
  potionId: string;
  potionData: Record<string, PotionInfo>;
  lp: string;
  className?: string;
  children?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = potionData[potionId];
  return (
    <Link
      href={`${lp}/potions/${potionId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? info?.name ?? displayName(`POTION.${potionId}`)}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img
                src={`${API}${info.image_url}`}
                alt=""
                className="w-8 h-8 object-contain"
                crossOrigin="anonymous"
              />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}
