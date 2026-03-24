"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Card } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import type { RelatedCard } from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import RelatedCards from "@/app/components/RelatedCards";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const colorMapSolid: Record<string, string> = {
  ironclad: "border-red-700",
  silent: "border-green-700",
  defect: "border-blue-700",
  necrobinder: "border-purple-700",
  regent: "border-orange-600",
  colorless: "border-gray-500",
  curse: "border-red-900",
  status: "border-gray-600",
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
  Attack: "\u2694",
  Skill: "\uD83D\uDEE1",
  Power: "\u2726",
  Status: "\u25C6",
  Curse: "\u2620",
  Quest: "\u2605",
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
  ironclad: "ironclad",
  silent: "silent",
  defect: "defect",
  necrobinder: "necrobinder",
  regent: "regent",
  colorless: "colorless",
};

// Merchant price ranges
function getMerchantPriceRange(rarity: string, color: string): { min: number; max: number } | null {
  const isColorless = color === "colorless";
  let base: number;
  switch (rarity) {
    case "Common": base = 50; break;
    case "Uncommon": base = 75; break;
    case "Rare": base = 150; break;
    default: return null;
  }
  if (isColorless) base = Math.round(base * 1.15);
  return { min: Math.floor(base * 0.95), max: Math.ceil(base * 1.05) };
}

function getUpgradedValue(
  base: number | null,
  upgradeVal: string | number | null | undefined
): number | null {
  if (base == null || upgradeVal == null) return base;
  if (typeof upgradeVal === "number") return upgradeVal;
  if (typeof upgradeVal === "string" && upgradeVal.startsWith("+"))
    return base + parseInt(upgradeVal);
  return base;
}

function getUpgradedDescription(card: Card, upgraded: boolean): string {
  let desc = (card.description || "").replace(/\n/g, " ");
  const u = upgraded && card.upgrade ? card.upgrade : null;
  const vars = card.vars || {};

  if (u) {
    for (const [key, upVal] of Object.entries(u)) {
      if (upVal == null) continue;
      const varKey = Object.keys(vars).find(
        (k) => k.toLowerCase() === key.toLowerCase()
      );
      if (varKey && vars[varKey] != null) {
        const base = vars[varKey];
        const upgradedVal = getUpgradedValue(base, upVal);
        if (upgradedVal !== null && upgradedVal !== base) {
          const baseStr = String(base);
          const upgradedStr = String(upgradedVal);
          desc = desc.replace(new RegExp(`\\b${baseStr}\\b`), upgradedStr);
        }
      }
      if (key.toLowerCase() === "energy") {
        const baseEnergy = vars["Energy"] ?? 1;
        const upEnergy = getUpgradedValue(baseEnergy, upVal) ?? baseEnergy;
        desc = desc.replace(/\[energy:(\d+)\]/, `[energy:${upEnergy}]`);
      }
    }
  }

  return desc;
}

type Tab = "overview" | "details" | "info";

export default function CardDetail() {
  const params = useParams();
  const id = params.id as string;
  const { lang } = useLanguage();

  const [card, setCard] = useState<Card | null>(null);
  const [spawnedCards, setSpawnedCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [betaArt, setBetaArt] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    cachedFetch<Card>(`${API}/api/cards/${id}?lang=${lang}`)
      .then((data) => {
        setCard(data);
        if (data.spawns_cards && data.spawns_cards.length > 0) {
          Promise.all(
            data.spawns_cards.map((sid: string) =>
              cachedFetch<Card>(`${API}/api/cards/${sid}?lang=${lang}`).catch(
                () => null
              )
            )
          ).then((results) => setSpawnedCards(results.filter(Boolean) as Card[]));
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      </div>
    );
  }

  if (notFound || !card) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/cards"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
        >
          &larr; {t("Back to", lang)} {t("Cards", lang)}
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Card Not Found
          </h1>
          <p className="text-[var(--text-muted)]">
            No card exists with ID &ldquo;{id}&rdquo;.
          </p>
        </div>
      </div>
    );
  }

  const u = upgraded && card.upgrade ? card.upgrade : null;
  const dmg = u ? getUpgradedValue(card.damage, u.damage) : card.damage;
  const blk = u ? getUpgradedValue(card.block, u.block) : card.block;
  const cost = u && u.cost != null ? (u.cost as number) : card.cost;
  const isUpgraded = upgraded && card.upgrade != null;
  const hasBetaArt = !!card.beta_image_url;
  const hasUpgrade = !!card.upgrade;

  const imgUrl =
    betaArt && card.beta_image_url
      ? card.beta_image_url
      : card.image_url || card.beta_image_url;

  const descText = getUpgradedDescription(card, upgraded);
  const energyIcon = energyIconMap[card.color] || "colorless";
  const priceRange = getMerchantPriceRange(card.rarity_key || card.rarity, card.color);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "details", label: t("Details", lang) },
    { key: "info", label: t("Info", lang) },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/cards"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Cards", lang)}
      </Link>

      <div
        className={`bg-[var(--bg-card)] rounded-2xl border-2 ${
          isUpgraded
            ? "border-emerald-600"
            : colorMapSolid[card.color] || "border-[var(--border-subtle)]"
        } shadow-2xl shadow-black/50 overflow-hidden`}
      >
        {/* Image */}
        {imgUrl && (
          <div className="bg-black/40">
            <img
              src={`${API}${imgUrl}`}
              alt={`${card.name} - Slay the Spire 2 Card`}
              className="w-full object-contain max-h-80"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <div className="p-5 sm:p-6">
          {/* Header: Name + Cost */}
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] leading-tight">
              {card.name}
              {isUpgraded && <span className="text-emerald-400">+</span>}
            </h1>
            <div className="ml-3 flex-shrink-0 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-primary)] border text-xl font-bold ${
                  isUpgraded && u?.cost != null
                    ? "border-emerald-700/50 text-emerald-400"
                    : "border-[var(--border-subtle)] text-[var(--accent-gold)]"
                }`}
              >
                {card.is_x_cost ? "X" : cost}
              </span>
              {(card.star_cost != null || card.is_x_star_cost) && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-[var(--bg-primary)] border border-amber-700/40 text-sm font-bold text-amber-300">
                  {card.is_x_star_cost ? "X" : card.star_cost}
                  <img
                    src={`${API}/static/images/icons/star_icon.png`}
                    alt="star"
                    className="w-4 h-4"
                    crossOrigin="anonymous"
                  />
                </span>
              )}
            </div>
          </div>

          {/* Metadata: Type / Rarity / Color / Target */}
          <div className="flex items-center gap-2 mb-5 text-sm">
            <span className="text-[var(--text-secondary)]">
              {typeIcons[card.type] || ""} {card.type}
            </span>
            <span className="text-[var(--text-muted)]">&middot;</span>
            <span className={rarityColors[card.rarity] || "text-gray-400"}>
              {card.rarity}
            </span>
            <span className="text-[var(--text-muted)]">&middot;</span>
            <span className="text-[var(--text-muted)] capitalize">
              {card.color}
            </span>
            {card.target && card.target !== "None" && card.target !== "Self" && (
              <>
                <span className="text-[var(--text-muted)]">&middot;</span>
                <span className="text-[var(--text-muted)]">
                  {card.target.replace(/([A-Z])/g, " $1").trim()}
                </span>
              </>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 border-b border-[var(--border-subtle)]">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === tb.key
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {tb.label}
              </button>
            ))}

            {/* Toggle buttons in tab bar */}
            <div className="ml-auto flex items-center gap-1.5">
              {hasBetaArt && (
                <button
                  onClick={() => setBetaArt(!betaArt)}
                  className={`text-sm w-8 h-8 flex items-center justify-center rounded transition-colors ${
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
                  onClick={() => setUpgraded(!upgraded)}
                  className={`text-sm w-8 h-8 flex items-center justify-center rounded transition-colors ${
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
          </div>

          {/* ===== Overview Tab ===== */}
          {tab === "overview" && (
            <>
              {/* Stats: DMG / BLK */}
              {(dmg || blk) && (
                <div className="flex gap-3 mb-5">
                  {dmg && (
                    <span
                      className={`text-sm px-3 py-1 rounded border ${
                        isUpgraded && u?.damage
                          ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/30"
                          : "bg-red-950/50 text-red-300 border-red-900/30"
                      }`}
                    >
                      {dmg}
                      {card.hit_count && card.hit_count > 1
                        ? ` x${card.hit_count}`
                        : ""}{" "}
                      DMG
                    </span>
                  )}
                  {blk && (
                    <span
                      className={`text-sm px-3 py-1 rounded border ${
                        isUpgraded && u?.block
                          ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/30"
                          : "bg-blue-950/50 text-blue-300 border-blue-900/30"
                      }`}
                    >
                      {blk} BLK
                    </span>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                <RichDescription
                  text={descText}
                  energyIcon={energyIcon}
                  relatedCards={spawnedCards.map((sc): RelatedCard => ({
                    id: sc.id,
                    name: sc.name,
                    image_url: sc.image_url,
                    type: sc.type,
                    rarity: sc.rarity,
                    cost: sc.cost,
                  }))}
                />
              </div>

              {/* Keywords */}
              {card.keywords && card.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {card.keywords.map((kw) => (
                    <Link
                      key={kw}
                      href={`/keywords/${kw.toLowerCase()}`}
                      className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/20 hover:border-[var(--accent-gold)]/50 transition-colors"
                    >
                      {kw}
                      {keywordTooltips[kw] && (
                        <span className="text-[var(--text-muted)] ml-1.5">
                          &mdash; {keywordTooltips[kw]}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              {/* Tags */}
              {card.tags && card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ===== Details Tab ===== */}
          {tab === "details" && (
            <>
              {/* Merchant Price */}
              {priceRange && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    {t("Merchant Price", lang)}
                  </h3>
                  <span className="text-sm px-3 py-1 rounded border bg-amber-950/30 text-[var(--accent-gold)] border-amber-900/30">
                    {priceRange.min}–{priceRange.max} Gold
                  </span>
                  {card.color === "colorless" && (
                    <span className="text-xs text-[var(--text-muted)] ml-2">
                      (15% colorless markup)
                    </span>
                  )}
                </div>
              )}

              {/* Powers Applied */}
              {card.powers_applied && card.powers_applied.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    {t("Powers Applied", lang)}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {card.powers_applied.map((pa) => {
                      const powerName = pa.power_key || pa.power;
                      const powerId = powerName.replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase();
                      return (
                        <Link
                          key={pa.power}
                          href={`/powers/${powerId}`}
                          className="text-xs px-2.5 py-1 rounded bg-purple-950/40 text-purple-300 border border-purple-900/30 hover:border-purple-700/50 hover:bg-purple-950/60 transition-colors"
                        >
                          {pa.power.replace(/([A-Z])/g, " $1").trim()}
                          {pa.amount ? ` ${pa.amount}` : ""}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Related Cards */}
              <RelatedCards
                currentId={id}
                keywords={card.keywords}
                tags={card.tags}
                color={card.color}
              />
            </>
          )}

          {/* ===== Info Tab ===== */}
          {tab === "info" && (
            <>
              <LocalizedNames entityType="cards" entityId={id} />
              <EntityHistory entityType="cards" entityId={id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
