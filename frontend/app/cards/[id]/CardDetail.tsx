"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const colorMapSolid: Record<string, string> = {
  ironclad: "border-[var(--color-ironclad)]",
  silent: "border-[var(--color-silent)]",
  defect: "border-[var(--color-defect)]",
  necrobinder: "border-[var(--color-necrobinder)]",
  regent: "border-[var(--color-regent)]",
  colorless: "border-[var(--color-colorless)]",
  curse: "border-[var(--color-curse)]",
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

function buildInteractiveWords(
  card: Card,
  powerData: Record<string, { id: string; name: string; description: string; type: string; image_url: string | null }>,
  keywordData: Record<string, { id: string; name: string; description: string }>,
  glossaryData: Record<string, { id: string; name: string; description: string }>,
  orbData: Record<string, { id: string; name: string; description: string }>,
  lp: string,
): Record<string, { tooltip: string; href: string }> {
  const words: Record<string, { tooltip: string; href: string }> = {};
  // Add keyword names (Sly, Exhaust, Ethereal, etc.)
  if (card.keywords) {
    for (const kw of card.keywords) {
      const data = keywordData[kw.toLowerCase()];
      const desc = data?.description || keywordTooltips[kw] || "";
      words[kw] = { tooltip: desc, href: `${lp}/keywords/${kw.toLowerCase()}` };
    }
  }
  // Add power names from [gold] tagged text (Dexterity, Thorns, Block, Strength, etc.)
  for (const [name, data] of Object.entries(powerData)) {
    words[data.name] = { tooltip: data.description, href: `${lp}/powers/${data.id.toLowerCase()}` };
  }
  // Add glossary terms (Block, Discard Pile, Draw Pile, Fatal, Forge, etc.)
  for (const [name, data] of Object.entries(glossaryData)) {
    if (!words[data.name]) {
      words[data.name] = { tooltip: data.description.replace(/\n/g, " "), href: `${lp}/keywords/${data.id.toLowerCase()}` };
    }
  }
  // Add orb names (Lightning, Frost, Dark, Glass, Plasma)
  for (const [name, data] of Object.entries(orbData)) {
    if (!words[data.name]) {
      words[data.name] = { tooltip: data.description.replace(/\n/g, " "), href: `${lp}/orbs/${data.id.toLowerCase()}` };
    }
  }
  return words;
}

function InlineTooltip({ label, tooltip, href, color, image }: {
  label: string; tooltip: string; href?: string; color: string; image?: string;
}) {
  const [show, setShow] = useState(false);
  const inner = (
    <span
      className="relative inline-flex items-center cursor-pointer"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ color }}
    >
      <span className="font-medium">{label}</span>
      {tooltip && (
        <span className="text-[var(--text-muted)] ml-1">— {tooltip.replace(/\[.*?\]/g, "").replace(/\n/g, " ").slice(0, 80)}</span>
      )}
      {show && tooltip && (
        <span className="absolute z-[100] bottom-full left-0 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left">
          {image && <img src={image} alt="" className="w-6 h-6 object-contain mb-1" crossOrigin="anonymous" />}
          <span className="font-semibold text-xs text-[var(--text-primary)] block">{label}</span>
          <span className="text-[10px] text-[var(--text-secondary)] leading-relaxed block mt-1">
            <RichDescription text={tooltip} />
          </span>
        </span>
      )}
    </span>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return <div>{inner}</div>;
}

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
  // Use upgrade_description as base text when upgraded (handles text-based upgrades like "X+1", "ALL cards", etc.)
  let desc = (upgraded && card.upgrade_description ? card.upgrade_description : card.description || "").replace(/\n/g, " ");
  const u = upgraded && card.upgrade ? card.upgrade : null;
  const vars = card.vars || {};

  if (u) {
    // Collect all replacements first to avoid cascading (e.g. Spur: 3→5 then 5→7)
    const replacements: { base: string; upgraded: string; varKey: string }[] = [];

    for (const [key, upVal] of Object.entries(u)) {
      if (upVal == null) continue;
      const kl = key.toLowerCase();
      // Handle icon tag upgrades first — skip general replacement to avoid corrupting tags
      if (kl === "energy") {
        const baseEnergy = vars["Energy"] ?? 1;
        const upEnergy = getUpgradedValue(baseEnergy, upVal) ?? baseEnergy;
        if (upEnergy !== baseEnergy) desc = desc.replace(/\[energy:(\d+)\]/, `[energy:${upEnergy}]`);
        continue;
      }
      if (kl === "stars" || kl === "starnextturnpower") {
        const starVar = kl === "stars" ? "Stars" : "StarNextTurnPower";
        const baseStar = vars[starVar] ?? 1;
        const upStar = getUpgradedValue(baseStar, upVal) ?? baseStar;
        if (upStar !== baseStar) desc = desc.replace(`[star:${baseStar}]`, `[star:${upStar}]`);
        continue;
      }
      // Handle repeat/hit count upgrades with contextual replacement ("N times")
      if (kl === "repeat" && vars["Repeat"] != null) {
        const base = vars["Repeat"];
        const upgradedRepeat = getUpgradedValue(base, upVal);
        if (upgradedRepeat !== null && upgradedRepeat !== base) {
          // When using upgrade_description, search for the upgraded value instead of base
          const searchVal = (upgraded && card.upgrade_description) ? upgradedRepeat : base;
          if (new RegExp(`\\b${searchVal}\\b\\s*times`, "i").test(desc)) {
            desc = desc.replace(new RegExp(`\\b${searchVal}\\b(\\s*times)`, "i"), `[green]${upgradedRepeat}[/green]$1`);
            continue;
          }
          // Fall through to general replacement for non-"times" repeat vars (e.g. "2 Orb Slots", "1 random Orb")
        } else {
          continue;
        }
      }
      const varKey = Object.keys(vars).find(
        (k) => k.toLowerCase() === kl
      );
      if (varKey && vars[varKey] != null) {
        const base = vars[varKey];
        const upgradedVal = getUpgradedValue(base, upVal);
        if (upgradedVal !== null && upgradedVal !== base) {
          replacements.push({ base: String(base), upgraded: String(upgradedVal), varKey });
        }
      }
    }

    // When using upgrade_description, the text already has upgraded values —
    // find them and wrap in [green] instead of replacing base values
    const usingUpgradeDesc = upgraded && !!card.upgrade_description;

    // Apply replacements in a single pass — skip ambiguous values (same number appears multiple times)
    if (replacements.length > 0) {
      const replMap = usingUpgradeDesc
        ? new Map(replacements.map((r) => [r.upgraded, r.upgraded]))
        : new Map(replacements.map((r) => [r.base, r.upgraded]));
      const pattern = replacements
        .map((r) => usingUpgradeDesc ? r.upgraded : r.base)
        .sort((a, b) => b.length - a.length)
        .map((s) => `\\b${s}\\b`)
        .join("|");
      const occurrences = new Map<string, number>();
      desc.replace(new RegExp(pattern, "g"), (match) => {
        occurrences.set(match, (occurrences.get(match) || 0) + 1);
        return match;
      });
      const used = new Set<string>();
      desc = desc.replace(new RegExp(pattern, "g"), (match) => {
        if (used.has(match)) return match;
        if ((occurrences.get(match) || 0) > 1) {
          // Allow replacement when all upgrades for this value are the same
          // (e.g. Bulk Up: both Strength and Dexterity go 2→3)
          const allSame = replacements.filter(r => r.base === match).every(r => r.upgraded === replMap.get(match));
          if (!allSame) return match;
          return `[green]${replMap.get(match)}[/green]`;
        }
        used.add(match);
        const repl = replMap.get(match);
        return repl ? `[green]${repl}[/green]` : match;
      });

      // Contextual replacement for ambiguous values (e.g. Coolheaded: "Channel 1 Frost. Draw 1 card." → only "Draw" changes)
      for (const r of replacements) {
        if ((occurrences.get(r.base) || 0) <= 1) continue;
        if (used.has(r.base)) continue;
        const context = r.varKey.toLowerCase().replace(/s$/, "");
        const fwd = new RegExp(`\\b${r.base}\\b(\\s+${context})(s?)`, "i");
        if (fwd.test(desc)) {
          const plural = parseInt(r.upgraded) === 1 ? "" : "s";
          desc = desc.replace(fwd, `[green]${r.upgraded}[/green]$1${plural}`);
          continue;
        }
        const bwd = new RegExp(`(${context}\\s+)\\b${r.base}\\b`, "i");
        if (bwd.test(desc)) {
          desc = desc.replace(bwd, `$1[green]${r.upgraded}[/green]`);
        }
      }
    }
  }

  return desc;
}

type Tab = "overview" | "details" | "info";

export default function CardDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { lang } = useLanguage();

    const lp = useLangPrefix();
const [card, setCard] = useState<Card | null>(null);
  const [spawnedCards, setSpawnedCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [betaArt, setBetaArt] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [powerData, setPowerData] = useState<Record<string, { id: string; name: string; description: string; type: string; image_url: string | null }>>({});
  const [keywordData, setKeywordData] = useState<Record<string, { id: string; name: string; description: string }>>({});
  const [glossaryData, setGlossaryData] = useState<Record<string, { id: string; name: string; description: string }>>({});
  const [orbData, setOrbData] = useState<Record<string, { id: string; name: string; description: string }>>({});

  useEffect(() => {
    if (!id) return;
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

  // Load powers, keywords, and glossary for inline tooltips
  useEffect(() => {
    cachedFetch<{ id: string; name: string; description: string; type: string; image_url: string | null }[]>(`${API}/api/powers?lang=${lang}`)
      .then((powers) => {
        const m: Record<string, typeof powers[0]> = {};
        for (const p of powers) m[p.name.toLowerCase()] = p;
        setPowerData(m);
      });
    cachedFetch<{ id: string; name: string; description: string }[]>(`${API}/api/keywords?lang=${lang}`)
      .then((kws) => {
        const m: Record<string, typeof kws[0]> = {};
        for (const k of kws) m[k.name.toLowerCase()] = k;
        setKeywordData(m);
      });
    cachedFetch<{ id: string; name: string; description: string }[]>(`${API}/api/glossary?lang=${lang}`)
      .then((terms) => {
        const m: Record<string, typeof terms[0]> = {};
        for (const t of terms) m[t.name.toLowerCase()] = t;
        setGlossaryData(m);
      });
    cachedFetch<{ id: string; name: string; description: string }[]>(`${API}/api/orbs?lang=${lang}`)
      .then((orbs) => {
        const m: Record<string, typeof orbs[0]> = {};
        for (const o of orbs) m[o.name.toLowerCase()] = o;
        setOrbData(m);
      });
  }, [lang]);

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
          href={`${lp}/cards`}
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
  const activeVariant = selectedVariant && card.type_variants ? card.type_variants[selectedVariant] : null;
  const dmg = activeVariant ? activeVariant.damage : (u ? getUpgradedValue(card.damage, u.damage) : card.damage);
  const blk = activeVariant ? activeVariant.block : (u ? getUpgradedValue(card.block, u.block) : card.block);
  const hitCount = u?.repeat ? getUpgradedValue(card.hit_count, u.repeat) : card.hit_count;
  const cost = u && u.cost != null ? (u.cost as number) : card.cost;
  const displayType = activeVariant ? activeVariant.type : card.type;
  const isUpgraded = upgraded && card.upgrade != null;
  const hasBetaArt = !!card.beta_image_url;
  const hasUpgrade = !!card.upgrade;
  const hasVariants = !!card.type_variants;

  const variantImg = activeVariant?.image_url || null;
  const imgUrl = variantImg
    ? variantImg
    : betaArt && card.beta_image_url
      ? card.beta_image_url
      : card.image_url || card.beta_image_url;

  const descText = activeVariant ? activeVariant.description : getUpgradedDescription(card, upgraded);
  const energyIcon = energyIconMap[card.color] || "colorless";
  const priceRange = getMerchantPriceRange(card.rarity_key || card.rarity, card.color);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "details", label: t("Details", lang) },
    { key: "info", label: t("Info", lang) },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Cards", lang)}
      </button>

      <div
        className={`bg-[var(--bg-card)] rounded-2xl border-2 ${
          isUpgraded
            ? "border-emerald-600"
            : colorMapSolid[card.color] || "border-[var(--border-subtle)]"
        } shadow-2xl shadow-black/50`}
      >
        {/* Image */}
        {imgUrl && (
          <div className="bg-black/40 rounded-t-2xl overflow-hidden">
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
                {card.is_x_cost ? "X" : cost != null && cost < 0 ? "U" : cost}
              </span>
              {(card.star_cost != null || card.is_x_star_cost) && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-[var(--bg-primary)] border border-amber-700/40 text-sm font-bold text-amber-300">
                  {card.is_x_star_cost ? "X" : card.star_cost}
                  <img
                    src={`${API}/static/images/icons/star_icon.webp`}
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
              {typeIcons[displayType] || ""} {displayType}
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

          {/* Type Variant Toggle */}
          {hasVariants && card.type_variants && (
            <div className="flex gap-1.5 mb-4">
              {Object.entries(card.type_variants).map(([key, v]) => (
                <button
                  key={key}
                  onClick={() => setSelectedVariant(selectedVariant === key ? null : key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    (selectedVariant === key || (!selectedVariant && key === card.type.toLowerCase()))
                      ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                      : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {typeIcons[v.type] || ""} {v.type}
                </button>
              ))}
            </div>
          )}

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
              {/* Description — show all variants if available */}
              {hasVariants && card.type_variants ? (
                <div className="space-y-3 mb-5">
                  {Object.entries(card.type_variants).map(([key, v]) => {
                    const isActive = selectedVariant === key || (!selectedVariant && key === card.type.toLowerCase());
                    return (
                      <div
                        key={key}
                        className={`text-sm leading-relaxed rounded-lg border transition-colors overflow-hidden ${
                          isActive
                            ? "border-[var(--accent-gold)]/30"
                            : "border-[var(--border-subtle)] opacity-60"
                        }`}
                      >
                        <div className={`px-3 py-2 ${isActive ? "bg-[var(--accent-gold)]/5" : "bg-[var(--bg-primary)]/50"}`}>
                          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-2">
                            {typeIcons[v.type] || ""} {v.type}
                          </span>
                          {v.description ? (
                            <span className="text-[var(--text-secondary)]">
                              <RichDescription text={v.description} energyIcon={energyIcon} />
                            </span>
                          ) : null}
                        </div>
                        {v.riders && v.riders.length > 0 && (
                          <div className="border-t border-[var(--border-subtle)] px-3 py-2 space-y-1.5">
                            {v.riders.map((r) => (
                              <div key={r.id} className="flex items-start gap-2 text-xs">
                                <span className="font-medium text-[var(--accent-gold)] whitespace-nowrap flex-shrink-0">
                                  + {r.name}
                                </span>
                                <span className="text-[var(--text-secondary)]">
                                  <RichDescription text={r.description} energyIcon={energyIcon} />
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                  <RichDescription
                    text={descText + (card.keywords && card.keywords.length > 0 ? "\n" + card.keywords.filter((kw) => !(isUpgraded && u?.remove_exhaust && kw === "Exhaust") && !(isUpgraded && u?.remove_ethereal && kw === "Ethereal")).map((kw) => `[gold]${kw}[/gold]`).join(". ") + "." : "") + (isUpgraded && u?.add_innate && !card.keywords?.includes("Innate") ? "\n[green]Innate[/green]." : "") + (isUpgraded && u?.add_retain && !card.keywords?.includes("Retain") ? "\n[green]Retain[/green]." : "")}
                    energyIcon={energyIcon}
                    relatedCards={spawnedCards.map((sc): RelatedCard => ({
                      id: sc.id,
                      name: sc.name,
                      image_url: sc.image_url,
                      type: sc.type,
                      rarity: sc.rarity,
                      cost: sc.cost,
                    }))}
                    interactiveWords={buildInteractiveWords(card, powerData, keywordData, glossaryData, orbData, lp)}
                  />
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
                          href={`${lp}/powers/${powerId}`}
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
