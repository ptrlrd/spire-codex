"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Card } from "@/lib/api";
import { getCardDisplayModel } from "@/lib/card-display";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import RichDescription from "./RichDescription";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const colorMap: Record<string, string> = {
  ironclad: "border-[var(--color-ironclad)]/60 hover:border-[var(--color-ironclad)]",
  silent: "border-[var(--color-silent)]/60 hover:border-[var(--color-silent)]",
  defect: "border-[var(--color-defect)]/60 hover:border-[var(--color-defect)]",
  necrobinder: "border-[var(--color-necrobinder)]/60 hover:border-[var(--color-necrobinder)]",
  regent: "border-[var(--color-regent)]/60 hover:border-[var(--color-regent)]",
  colorless: "border-[var(--color-colorless)]/60 hover:border-[var(--color-colorless)]",
  curse: "border-[var(--color-curse)]/60 hover:border-[var(--color-curse)]",
  status: "border-gray-700/60 hover:border-gray-500",
};

const rarityColors: Record<string, string> = {
  Basic: "text-gray-400",
  Common: "text-gray-300",
  Uncommon: "text-blue-400",
  Rare: "text-[var(--accent-gold)]",
  Ancient: "text-purple-400",
  Curse: "text-red-400",
  Status: "text-gray-500",
  Event: "text-emerald-400",
  Token: "text-gray-500",
  Quest: "text-amber-400",
};

const energyIconMap: Record<string, string> = {
  ironclad: "ironclad", silent: "silent", defect: "defect",
  necrobinder: "necrobinder", regent: "regent", colorless: "colorless",
};

// Card grid tiles route through the same `RichDescription` tokenizer the
// detail pages use so every BBCode tag the site supports (every color,
// [b]/[i], [sine]/[jitter], [energy:N], [star:N]) renders consistently.
// The previous inline regex only handled [gold] / [green] / energy / star,
// so tags like [purple] (Blade of Ink) leaked through as literal text.
function renderDescription(card: Card, text: string): React.ReactNode {
  const normalizedText = text.replace(/\n/g, " ");
  const energyIcon = energyIconMap[card.color] || "colorless";
  return <RichDescription text={normalizedText} energyIcon={energyIcon} />;
}

function CardItem({ card }: { card: Card }) {
  const lp = useLangPrefix();
  const [upgraded, setUpgraded] = useState(false);
  const [betaArt, setBetaArt] = useState(false);
  const display = getCardDisplayModel(card, upgraded);

  const isUpgraded = display.isUpgraded;
  const hasBetaArt = !!card.beta_image_url;
  const hasUpgrade = !!card.upgrade;

  return (
    <div
      className={`group relative flex flex-col bg-[var(--bg-card)] rounded-lg border-2 ${
        isUpgraded ? "border-emerald-700/60 hover:border-emerald-500" : colorMap[card.color] || "border-[var(--border-subtle)] hover:border-[var(--border-accent)]"
      } p-4 transition-all hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/20`}
    >
      <Link href={`${lp}/cards/${card.id.toLowerCase()}`} className="absolute inset-0 z-10" />

      {(() => {
        const imgUrl = betaArt && card.beta_image_url ? card.beta_image_url : (card.image_url || card.beta_image_url);
        return imgUrl ? (
          <div className="mb-3 -mx-4 -mt-4">
            <img
              src={`${API_BASE}${imgUrl}`}
              alt={`${card.name} - Slay the Spire 2 Card`}
              className="w-full h-32 object-cover rounded-t-lg"
              loading="lazy"
              crossOrigin="anonymous"
            />
          </div>
        ) : null;
      })()}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
          {card.name}{isUpgraded && <span className="text-emerald-400">+</span>}
        </h3>
        <div className="ml-2 flex-shrink-0 flex items-center gap-1">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--bg-primary)] border text-sm font-bold ${
            isUpgraded && display.upgrade?.cost != null ? "border-emerald-700/50 text-emerald-400" : "border-[var(--border-subtle)] text-[var(--accent-gold)]"
          }`}>
            {card.is_x_cost ? "X" : display.cost != null && display.cost < 0 ? "U" : display.cost}
          </span>
          {(card.star_cost != null || card.is_x_star_cost) && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--bg-primary)] border border-amber-700/40 text-xs font-bold text-amber-300">
              {card.is_x_star_cost ? "X" : card.star_cost}
              <img src={`${API_BASE}/static/images/icons/star_icon.webp`}
                alt="star" className="w-3.5 h-3.5" crossOrigin="anonymous" />
            </span>
          )}
        </div>
      </div>

      {/* Type + Rarity */}
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-[var(--text-secondary)]">
          {card.type}
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className={rarityColors[card.rarity] || "text-gray-400"}>
          {card.rarity}
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text-muted)] capitalize">
          {card.color}
        </span>
      </div>

      {/* Description */}
      <div className="space-y-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
        <p>{renderDescription(card, display.descriptionText)}</p>
        {display.keywordText && <p>{renderDescription(card, display.keywordText)}</p>}
      </div>


      {/* Spacer to push buttons to bottom */}
      <div className="flex-grow" />

      {/* Per-card toggle buttons */}
      {(hasBetaArt || hasUpgrade) && (
        <div className="flex justify-end gap-1.5 mt-3 relative z-20">
          {hasBetaArt && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBetaArt(!betaArt); }}
              className={`text-base w-7 h-7 flex items-center justify-center rounded transition-colors ${
                betaArt
                  ? "bg-amber-950/60 border border-amber-700/50"
                  : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] opacity-50 hover:opacity-100"
              }`}
              title={betaArt ? "Show normal art" : "Show beta art"}
            >
              ✏️
            </button>
          )}
          {hasUpgrade && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUpgraded(!upgraded); }}
              className={`text-base w-7 h-7 flex items-center justify-center rounded transition-colors ${
                upgraded
                  ? "bg-emerald-950/60 border border-emerald-700/50"
                  : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] opacity-50 hover:opacity-100"
              }`}
              title={upgraded ? "Show base card" : "Show upgraded"}
            >
              🔨
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => (
        <CardItem key={card.id} card={card} />
      ))}
    </div>
  );
}
