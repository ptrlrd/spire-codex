"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Card } from "@/lib/api";
import { useLangPrefix } from "@/lib/use-lang-prefix";

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
  const desc = (upgraded && card.upgrade_description ? card.upgrade_description : card.description || "").replace(/\n/g, " ");
  const u = upgraded && card.upgrade ? card.upgrade : null;
  const vars = card.vars || {};

  let text = desc;
  if (u) {
    const replacements: { base: string; upgraded: string; varKey: string }[] = [];

    for (const [key, upVal] of Object.entries(u)) {
      if (upVal == null) continue;
      const kl = key.toLowerCase();
      // Handle icon tag upgrades first — skip general replacement to avoid corrupting tags
      if (kl === "energy") {
        const baseEnergy = vars["Energy"] ?? 1;
        const upEnergy = getUpgradedValue(baseEnergy, upVal) ?? baseEnergy;
        if (upEnergy !== baseEnergy) text = text.replace(/\[energy:(\d+)\]/, `[energy:${upEnergy}]`);
        continue;
      }
      if (kl === "stars" || kl === "starnextturnpower") {
        const starVar = kl === "stars" ? "Stars" : "StarNextTurnPower";
        const baseStar = vars[starVar] ?? 1;
        const upStar = getUpgradedValue(baseStar, upVal) ?? baseStar;
        if (upStar !== baseStar) text = text.replace(`[star:${baseStar}]`, `[star:${upStar}]`);
        continue;
      }
      if (kl === "repeat" && vars["Repeat"] != null) {
        const base = vars["Repeat"];
        const upgradedVal = getUpgradedValue(base, upVal);
        if (upgradedVal !== null && upgradedVal !== base) {
          if (new RegExp(`\\b${base}\\b\\s*times`, "i").test(text)) {
            text = text.replace(new RegExp(`\\b${base}\\b(\\s*times)`, "i"), `[green]${upgradedVal}[/green]$1`);
            continue;
          }
        } else {
          continue;
        }
      }
      const varKey = Object.keys(vars).find(k => k.toLowerCase() === kl);
      if (varKey && vars[varKey] != null) {
        const base = vars[varKey];
        const upgradedVal = getUpgradedValue(base, upVal);
        if (upgradedVal !== null && upgradedVal !== base) {
          replacements.push({ base: String(base), upgraded: String(upgradedVal), varKey });
        }
      }
    }

    if (replacements.length > 0) {
      const occurrences = new Map<string, number>();
      for (const r of replacements) {
        const count = (text.match(new RegExp(`\\b${r.base}\\b`, "g")) || []).length;
        occurrences.set(r.base, Math.max(occurrences.get(r.base) || 0, count));
      }

      // Single-pass for unambiguous values + ambiguous values where all upgrades are the same
      // (e.g. Bulk Up: both Strength and Dexterity go 2→3, Capture Spirit: both Damage and Cards go 3→4)
      const sameUpgradeAmbiguous = replacements.filter(r => {
        if ((occurrences.get(r.base) || 0) <= 1) return false;
        return replacements.filter(r2 => r2.base === r.base).every(r2 => r2.upgraded === r.upgraded);
      });
      const eligible = [...replacements.filter(r => (occurrences.get(r.base) || 0) === 1), ...sameUpgradeAmbiguous];
      if (eligible.length > 0) {
        const replMap = new Map(eligible.map(r => [r.base, r.upgraded]));
        const pattern = eligible.map(r => r.base).sort((a, b) => b.length - a.length).map(s => `\\b${s}\\b`).join("|");
        const used = new Set<string>();
        text = text.replace(new RegExp(pattern, "g"), (match) => {
          // For same-upgrade-ambiguous values, replace all occurrences
          if (sameUpgradeAmbiguous.some(r => r.base === match)) {
            return `[green]${replMap.get(match)}[/green]`;
          }
          if (used.has(match)) return match;
          used.add(match);
          const repl = replMap.get(match);
          return repl ? `[green]${repl}[/green]` : match;
        });
      }

      // Contextual replacement for ambiguous values
      for (const r of replacements) {
        if ((occurrences.get(r.base) || 0) <= 1) continue;
        if (sameUpgradeAmbiguous.some(r2 => r2.base === r.base)) continue;
        const context = r.varKey.toLowerCase().replace(/s$/, "");
        const fwd = new RegExp(`\\b${r.base}\\b(\\s+${context})(s?)`, "i");
        if (fwd.test(text)) {
          const plural = parseInt(r.upgraded) === 1 ? "" : "s";
          text = text.replace(fwd, `[green]${r.upgraded}[/green]$1${plural}`);
          continue;
        }
        const bwd = new RegExp(`(${context}\\s+)\\b${r.base}\\b`, "i");
        if (bwd.test(text)) {
          text = text.replace(bwd, `$1[green]${r.upgraded}[/green]`);
        }
      }
    }
  }

  const parts: React.ReactNode[] = [];
  const regex = /(\[gold\].*?\[\/gold\]|\[green\].*?\[\/green\]|\[energy:(\d+)\]|\[star:(\d+)\])/g;
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
    } else if (segment.startsWith("[green]")) {
      const inner = segment.replace(/\[green\]/g, "").replace(/\[\/green\]/g, "");
      parts.push(<span key={matchArr.index} className="text-emerald-400">{inner}</span>);
    } else if (segment.startsWith("[energy:")) {
      const count = parseInt(matchArr[2]);
      const iconName = energyIconMap[card.color] || "colorless";
      const icons = [];
      for (let i = 0; i < count; i++) {
        icons.push(
          <img key={i} src={`${API_BASE}/static/images/icons/${iconName}_energy_icon.webp`}
            alt="energy" className="inline-block w-4 h-4 align-text-bottom" crossOrigin="anonymous" />
        );
      }
      parts.push(<span key={matchArr.index}>{icons}</span>);
    } else if (segment.startsWith("[star:")) {
      const count = parseInt(matchArr[3]);
      const icons = [];
      for (let i = 0; i < count; i++) {
        icons.push(
          <img key={i} src={`${API_BASE}/static/images/icons/star_icon.webp`}
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
  const lp = useLangPrefix();
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
            isUpgraded && u?.cost != null ? "border-emerald-700/50 text-emerald-400" : "border-[var(--border-subtle)] text-[var(--accent-gold)]"
          }`}>
            {card.is_x_cost ? "X" : cost != null && cost < 0 ? "U" : cost}
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
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {renderDescription(card, upgraded)}
        {card.keywords && card.keywords.length > 0 && (
          <>
            {" "}
            {card.keywords
              .filter((kw) => !(isUpgraded && u?.remove_exhaust && kw === "Exhaust") && !(isUpgraded && u?.remove_ethereal && kw === "Ethereal"))
              .map((kw, i) => (
                <span key={kw}>
                  <span className="text-[var(--accent-gold)]">{kw}</span>
                  {i < card.keywords!.filter((k) => !(isUpgraded && u?.remove_exhaust && k === "Exhaust") && !(isUpgraded && u?.remove_ethereal && k === "Ethereal")).length - 1 ? ". " : "."}
                </span>
              ))}
            {isUpgraded && u?.add_innate && !card.keywords?.includes("Innate") && (
              <span> <span className="text-emerald-400">Innate</span>.</span>
            )}
            {isUpgraded && u?.add_retain && !card.keywords?.includes("Retain") && (
              <span> <span className="text-emerald-400">Retain</span>.</span>
            )}
          </>
        )}
      </p>


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
