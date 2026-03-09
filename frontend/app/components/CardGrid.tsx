"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Card } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const colorMap: Record<string, string> = {
  ironclad: "border-red-800/60 hover:border-red-600",
  silent: "border-green-800/60 hover:border-green-600",
  defect: "border-blue-800/60 hover:border-blue-600",
  necrobinder: "border-purple-800/60 hover:border-purple-600",
  regent: "border-orange-800/60 hover:border-orange-500",
  colorless: "border-gray-600/60 hover:border-gray-400",
  curse: "border-red-950/60 hover:border-red-800",
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

const typeIcons: Record<string, string> = {
  Attack: "⚔",
  Skill: "🛡",
  Power: "✦",
  Status: "◆",
  Curse: "☠",
  Quest: "★",
};

const keywordTooltips: Record<string, string> = {
  Exhaust: "Remove this card from your deck when played.",
  Ethereal: "If this card is in your hand at end of turn, discard it.",
  Innate: "Always appears in your opening hand.",
  Unplayable: "Cannot be played from your hand.",
  Retain: "Keep this card in your hand at end of turn.",
  Sly: "Can be played from the discard pile.",
  Eternal: "Cannot be removed from your deck.",
};

const energyIconMap: Record<string, string> = {
  ironclad: "ironclad", silent: "silent", defect: "defect",
  necrobinder: "necrobinder", regent: "regent", colorless: "colorless",
};

function renderDescription(card: Card, upgraded: boolean): React.ReactNode {
  const desc = (card.description || "").replace(/\n/g, " ");
  const u = upgraded && card.upgrade ? card.upgrade : null;
  const vars = card.vars || {};

  let text = desc;
  if (u) {
    for (const [key, upVal] of Object.entries(u)) {
      if (upVal == null) continue;
      const varKey = Object.keys(vars).find(k => k.toLowerCase() === key.toLowerCase());
      if (varKey && vars[varKey] != null) {
        const base = vars[varKey];
        const upgradedVal = getUpgradedValue(base, upVal);
        if (upgradedVal !== null && upgradedVal !== base) {
          const baseStr = String(base);
          const upgradedStr = String(upgradedVal);
          text = text.replace(new RegExp(`\\b${baseStr}\\b`), upgradedStr);
        }
      }
      if (key.toLowerCase() === "energy") {
        const baseEnergy = vars["Energy"] ?? 1;
        const upEnergy = getUpgradedValue(baseEnergy, upVal) ?? baseEnergy;
        text = text.replace(/\[energy:(\d+)\]/, `[energy:${upEnergy}]`);
      }
    }
  }

  const parts: React.ReactNode[] = [];
  const regex = /(\[gold\].*?\[\/gold\]|\[energy:(\d+)\]|\[star:(\d+)\])/g;
  let lastIndex = 0;
  let matchArr: RegExpExecArray | null;

  while ((matchArr = regex.exec(text)) !== null) {
    if (matchArr.index > lastIndex) {
      parts.push(text.slice(lastIndex, matchArr.index));
    }

    const segment = matchArr[0];
    if (segment.startsWith("[gold]")) {
      const inner = segment.replace(/\[gold\]/g, "").replace(/\[\/gold\]/g, "");
      parts.push(<span key={matchArr.index} className="text-[var(--accent-gold)]">{inner}</span>);
    } else if (segment.startsWith("[energy:")) {
      const count = parseInt(matchArr[2]);
      const iconName = energyIconMap[card.color] || "colorless";
      const icons = [];
      for (let i = 0; i < count; i++) {
        icons.push(
          <img key={i} src={`${API_BASE}/static/images/icons/${iconName}_energy_icon.png`}
            alt="energy" className="inline-block w-4 h-4 align-text-bottom" crossOrigin="anonymous" />
        );
      }
      parts.push(<span key={matchArr.index}>{icons}</span>);
    } else if (segment.startsWith("[star:")) {
      const count = parseInt(matchArr[3]);
      const icons = [];
      for (let i = 0; i < count; i++) {
        icons.push(
          <img key={i} src={`${API_BASE}/static/images/icons/star_icon.png`}
            alt="star" className="inline-block w-4 h-4 align-text-bottom" crossOrigin="anonymous" />
        );
      }
      parts.push(<span key={matchArr.index}>{icons}</span>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function getUpgradedValue(base: number | null, upgradeVal: string | number | null | undefined): number | null {
  if (base == null || upgradeVal == null) return base;
  if (typeof upgradeVal === "number") return upgradeVal;
  if (typeof upgradeVal === "string" && upgradeVal.startsWith("+")) return base + parseInt(upgradeVal);
  return base;
}

function CardItem({ card }: { card: Card }) {
  const [upgraded, setUpgraded] = useState(false);
  const [betaArt, setBetaArt] = useState(false);

  const u = upgraded && card.upgrade ? card.upgrade : null;
  const dmg = u ? getUpgradedValue(card.damage, u.damage) : card.damage;
  const blk = u ? getUpgradedValue(card.block, u.block) : card.block;
  const cost = u && u.cost != null ? u.cost as number : card.cost;
  const isUpgraded = upgraded && card.upgrade != null;
  const hasBetaArt = !!card.beta_image_url;
  const hasUpgrade = !!card.upgrade;

  return (
    <div
      className={`group relative flex flex-col bg-[var(--bg-card)] rounded-lg border-2 ${
        isUpgraded ? "border-emerald-700/60 hover:border-emerald-500" : colorMap[card.color] || "border-[var(--border-subtle)] hover:border-[var(--border-accent)]"
      } p-4 transition-all hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/20`}
    >
      <Link href={`/cards/${card.id}`} className="absolute inset-0 z-10" />

      {(() => {
        const imgUrl = betaArt && card.beta_image_url ? card.beta_image_url : (card.image_url || card.beta_image_url);
        return imgUrl ? (
          <div className="mb-3 -mx-4 -mt-4">
            <img
              src={`${API_BASE}${imgUrl}`}
              alt={card.name}
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
            isUpgraded && u?.cost != null ? "border-emerald-700/50 text-emerald-400" : "border-[var(--border-subtle)] text-[var(--accent-gold)]"
          }`}>
            {card.is_x_cost ? "X" : cost}
          </span>
          {(card.star_cost != null || card.is_x_star_cost) && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--bg-primary)] border border-amber-700/40 text-xs font-bold text-amber-300">
              {card.is_x_star_cost ? "X" : card.star_cost}
              <img src={`${API_BASE}/static/images/icons/star_icon.png`}
                alt="star" className="w-3.5 h-3.5" crossOrigin="anonymous" />
            </span>
          )}
        </div>
      </div>

      {/* Type + Rarity */}
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-[var(--text-secondary)]">
          {typeIcons[card.type] || ""} {card.type}
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

      {/* Stats */}
      {(dmg || blk) && (
        <div className="flex gap-3 mb-3">
          {dmg && (
            <span className={`text-xs px-2 py-0.5 rounded border ${
              isUpgraded && u?.damage ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/30" : "bg-red-950/50 text-red-300 border-red-900/30"
            }`}>
              {dmg}
              {card.hit_count && card.hit_count > 1
                ? ` x${card.hit_count}`
                : ""}{" "}
              DMG
            </span>
          )}
          {blk && (
            <span className={`text-xs px-2 py-0.5 rounded border ${
              isUpgraded && u?.block ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/30" : "bg-blue-950/50 text-blue-300 border-blue-900/30"
            }`}>
              {blk} BLK
            </span>
          )}
        </div>
      )}

      {/* Description */}
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
        {renderDescription(card, upgraded)}
      </p>

      {/* Keywords */}
      {card.keywords && card.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {card.keywords.map((kw) => (
            <span
              key={kw}
              className="relative text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/20 cursor-help group/kw"
              title={keywordTooltips[kw] || kw}
            >
              {kw}
              {keywordTooltips[kw] && (
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] leading-snug shadow-lg opacity-0 group-hover/kw:opacity-100 transition-opacity z-10">
                  {keywordTooltips[kw]}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

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
