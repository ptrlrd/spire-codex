"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Card } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import type { RelatedCard } from "@/app/components/RichDescription";
import { getCardDisplayModel } from "@/lib/card-display";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import RelatedCards from "@/app/components/RelatedCards";
import EntityProse from "@/app/components/EntityProse";
import { imageUrl, fullCardUrl, enchantedCardUrl } from "@/lib/image-url";
import EntityRunStats, { type EntityStats } from "@/app/components/EntityRunStats";
import HoverTooltip from "@/app/components/HoverTooltip";
import { useChannel, useLangPrefix } from "@/lib/use-lang-prefix";
import BetaDiffNotice from "@/app/components/BetaDiffNotice";
import "../../card-revamp.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Per-entity character accent for the wiki page spine (--spine).
const SPINE_COLOR: Record<string, string> = {
  ironclad: "var(--color-ironclad)",
  silent: "var(--color-silent)",
  defect: "var(--color-defect)",
  necrobinder: "var(--color-necrobinder)",
  regent: "var(--color-regent)",
  colorless: "var(--color-colorless)",
  curse: "var(--color-curse)",
  status: "var(--text-muted)",
};

// Headline figures for the infobox mini-stats block. Same endpoint EntityRunStats
// fetches, so cachedFetch dedupes it (no extra request).
interface MiniStats {
  picks: number;
  win_rate: number;
  pick_rate: number;
  score: number | null;
  elo: number | null;
}

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
  keywords: string[],
  powerData: Record<string, { id: string; name: string; description: string; type: string; image_url: string | null }>,
  keywordData: Record<string, { id: string; name: string; description: string }>,
  glossaryData: Record<string, { id: string; name: string; description: string }>,
  orbData: Record<string, { id: string; name: string; description: string }>,
  lp: string,
): Record<string, { tooltip: string; href: string }> {
  const words: Record<string, { tooltip: string; href: string }> = {};
  // Add keyword names (Sly, Exhaust, Ethereal, etc.)
  for (const kw of keywords) {
    const data = keywordData[kw.toLowerCase()];
    const desc = data?.description || keywordTooltips[kw] || "";
    words[kw] = { tooltip: desc, href: `${lp}/keywords/${kw.toLowerCase()}` };
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
        <span className="text-[var(--text-muted)] ml-1">{tooltip.replace(/\[.*?\]/g, "").replace(/\n/g, " ").slice(0, 80)}</span>
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

export default function CardDetail({ initialCard, initialEnchantments, initialStats }: { initialCard?: Card | null; initialEnchantments?: string[]; initialStats?: EntityStats | null } = {}) {
  const params = useParams();
  const id = params.id as string;
  const { lang } = useLanguage();

  const lp = useLangPrefix();
  const channel = useChannel();
  const [card, setCard] = useState<Card | null>(initialCard ?? null);
  const [spawnedCards, setSpawnedCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(!initialCard);
  const [notFound, setNotFound] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [betaArt, setBetaArt] = useState(false);
  const [cardImgFailed, setCardImgFailed] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  // Enchantment chosen in the infobox variant switcher ("none" = plain render).
  const [selectedEnch, setSelectedEnch] = useState<string>("none");
  // Scroll-spy: which section the ToC highlights.
  const [activeSection, setActiveSection] = useState<string>("performance");
  const [miniStats, setMiniStats] = useState<MiniStats | null>(null);
  const [powerData, setPowerData] = useState<Record<string, { id: string; name: string; description: string; type: string; image_url: string | null }>>({});
  const [keywordData, setKeywordData] = useState<Record<string, { id: string; name: string; description: string }>>({});
  const [glossaryData, setGlossaryData] = useState<Record<string, { id: string; name: string; description: string }>>({});
  const [orbData, setOrbData] = useState<Record<string, { id: string; name: string; description: string }>>({});
  // Enchantments this card can take (server-passed, from the render manifest)
  // + their localized name/description for the Enchantments section + switcher.
  const cardEnchantments = initialEnchantments ?? [];
  const [enchMeta, setEnchMeta] = useState<Record<string, { id: string; name: string; description: string; image_url: string | null }>>({});

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
    if (cardEnchantments.length > 0)
      cachedFetch<{ id: string; name: string; description: string; image_url: string | null }[]>(`${API}/api/enchantments?lang=${lang}`)
        .then((enchs) => {
          const m: Record<string, typeof enchs[0]> = {};
          for (const e of enchs) m[e.id.toLowerCase()] = e;
          setEnchMeta(m);
        });
  }, [lang]);

  // Headline community numbers for the infobox mini block. Hits the same URL
  // EntityRunStats fetches, so cachedFetch serves it from cache.
  useEffect(() => {
    if (!id) return;
    cachedFetch<MiniStats>(`${API}/api/runs/stats/cards/${id}`)
      .then(setMiniStats)
      .catch(() => {});
  }, [id]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!card) return;
    const secs = Array.from(
      document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"),
    );
    if (secs.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        });
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [card, cardEnchantments.length]);

  const handleTocClick = (e: ReactMouseEvent, secId: string) => {
    e.preventDefault();
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(secId);
    }
  };

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

  const display = getCardDisplayModel(card, upgraded);
  const activeVariant = selectedVariant && card.type_variants ? card.type_variants[selectedVariant] : null;
  const dmg = activeVariant ? activeVariant.damage : display.damage;
  const blk = activeVariant ? activeVariant.block : display.block;
  const hitCount = activeVariant ? card.hit_count : display.hitCount;
  const cost = activeVariant ? card.cost : display.cost;
  const displayType = activeVariant ? activeVariant.type : card.type;
  const isUpgraded = display.isUpgraded;
  const hasBetaArt = !!card.beta_image_url;
  const hasUpgrade = !!card.upgrade;
  const hasVariants = !!card.type_variants;

  const variantImg = activeVariant?.image_url || null;
  const imgUrl = variantImg
    ? variantImg
    : betaArt && card.beta_image_url
      ? card.beta_image_url
      : card.image_url || card.beta_image_url;

  const descText = activeVariant ? activeVariant.description : display.descriptionText;
  const keywordText = activeVariant ? "" : display.keywordText;
  const energyIcon = energyIconMap[card.color] || "colorless";
  const priceRange = getMerchantPriceRange(card.rarity_key || card.rarity, card.color);
  const displayKeywords = [...display.visibleKeywords, ...display.addedKeywords];

  const interactiveWords = buildInteractiveWords(
    displayKeywords,
    powerData,
    keywordData,
    glossaryData,
    orbData,
    lp,
  );

  const spineColor = SPINE_COLOR[card.color] ?? "var(--accent-gold)";
  const characterLabel = card.color
    ? card.color.charAt(0).toUpperCase() + card.color.slice(1)
    : "—";
  const costLabel = card.is_x_cost ? "X" : cost != null && cost < 0 ? "U" : String(cost);
  const targetLabel =
    card.target && card.target !== "None" && card.target !== "Self"
      ? card.target.replace(/([A-Z])/g, " $1").trim()
      : null;
  // Plain-text lede from the card effect (rich tags + newlines stripped).
  const ledeText = descText
    ? descText.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim()
    : "";

  const enchActive = selectedEnch !== "none" && cardEnchantments.includes(selectedEnch);
  // Infobox render: enchanted render > raw artwork (detail / beta / variant /
  // failed full render) > full engine render. Mirrors the old image logic while
  // driving off the new variant switcher.
  const renderSrc = enchActive
    ? enchantedCardUrl(card.id.toLowerCase(), selectedEnch, isUpgraded, channel, lang)
    : betaArt || variantImg || cardImgFailed
      ? imageUrl(imgUrl)
      : fullCardUrl(card.id.toLowerCase(), isUpgraded, channel, lang);

  const tocItems: { id: string; label: string }[] = [
    { id: "performance", label: t("Community", lang) },
    { id: "description", label: t("Description", lang) },
    { id: "relations", label: t("Relations", lang) },
    { id: "history", label: t("Version history", lang) },
  ];

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": spineColor,
        ...(imgUrl ? { "--entity-bg": `url("${imageUrl(imgUrl)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <Link href={`${lp}/cards`} className="cd-back">
          &larr; {t("Back to", lang)} {t("Cards", lang)}
        </Link>
        <div style={{ marginTop: 12 }}>
          <BetaDiffNotice entityType="cards" entityId={card.id} />
        </div>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero (artwork lives in the page background now, not inline) */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{characterLabel}</span>
              <span>&middot;</span>
              <span>{card.rarity}</span>
              <span>&middot;</span>
              <span>
                {typeIcons[displayType] || ""} {displayType}
              </span>
              <span>&middot;</span>
              <span>{costLabel} {t("Energy", lang)}</span>
              {(card.star_cost != null || card.is_x_star_cost) && (
                <>
                  <span>&middot;</span>
                  <span>{card.is_x_star_cost ? "X" : card.star_cost} &#9733;</span>
                </>
              )}
            </p>
            <h1>
              {card.name}
              {isUpgraded && <span className="up">+</span>}
            </h1>
            {ledeText && <p className="lede">{ledeText}</p>}
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page", lang)}>
            {tocItems.map((it) => (
              <a
                key={it.id}
                href={`#${it.id}`}
                className={activeSection === it.id ? "on" : undefined}
                onClick={(e) => handleTocClick(e, it.id)}
              >
                {it.label}
              </a>
            ))}
          </nav>

          {/* Community performance (featured first) */}
          <section id="performance">
            <h2>{t("Community performance", lang)}</h2>
            <p className="h-note">
              {t(
                "Live aggregate across community-submitted runs. Filter by bracket to see how it holds up at higher levels of play.",
                lang,
              )}
            </p>
            <EntityRunStats
              entityType="cards"
              entityId={id}
              entityName={card.name}
              variant="wiki"
              initialStats={initialStats}
            />
          </section>

          {/* Description */}
          <section id="description">
            <h2>{t("Description", lang)}</h2>

            {/* Type variant toggle (re-scopes description + render) */}
            {hasVariants && card.type_variants && (
              <div className="vtoggle">
                {Object.entries(card.type_variants).map(([key, v]) => {
                  const on =
                    selectedVariant === key ||
                    (!selectedVariant && key === card.type.toLowerCase());
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`vbtn${on ? " on" : ""}`}
                      onClick={() =>
                        setSelectedVariant(selectedVariant === key ? null : key)
                      }
                    >
                      {typeIcons[v.type] || ""} {v.type}
                    </button>
                  );
                })}
              </div>
            )}

            {hasVariants && card.type_variants ? (
              <div className="space-y-3">
                {Object.entries(card.type_variants).map(([key, v]) => {
                  const isActive =
                    selectedVariant === key ||
                    (!selectedVariant && key === card.type.toLowerCase());
                  return (
                    <div
                      key={key}
                      className={`text-sm leading-relaxed rounded-lg border transition-colors overflow-hidden ${
                        isActive
                          ? "border-[var(--accent-gold)]/30"
                          : "border-[var(--border-subtle)] opacity-60"
                      }`}
                    >
                      <div
                        className={`px-3 py-2 ${
                          isActive ? "bg-[var(--accent-gold)]/5" : "bg-[var(--bg-primary)]/50"
                        }`}
                      >
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
              <>
                <div className="desc-quote">
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
                    interactiveWords={interactiveWords}
                  />
                </div>
                {keywordText && (
                  <div className="desc-body">
                    <RichDescription
                      text={keywordText}
                      energyIcon={energyIcon}
                      interactiveWords={interactiveWords}
                    />
                  </div>
                )}
              </>
            )}

            {/* Powers applied */}
            {card.powers_applied && card.powers_applied.length > 0 && (
              <>
                <h3 className="subh">{t("Powers Applied", lang)}</h3>
                <div className="pow-list">
                  {card.powers_applied.map((pa) => {
                    const powerName = pa.power_key || pa.power;
                    const powerId = powerName
                      .replace(/([A-Z])/g, "_$1")
                      .replace(/^_/, "")
                      .toUpperCase();
                    const prettyName = pa.power.replace(/([A-Z])/g, " $1").trim();
                    const data = powerData[pa.power.toLowerCase()];
                    return (
                      <HoverTooltip key={pa.power} title={prettyName} content={data?.description}>
                        <Link href={`${lp}/powers/${powerId}`}>
                          {prettyName}
                          {pa.amount ? ` ${pa.amount}` : ""}
                        </Link>
                      </HoverTooltip>
                    );
                  })}
                </div>
              </>
            )}

            {/* Programmatic prose block for SEO */}
            <EntityProse kind="card" card={card} />
          </section>

          {/* Relations */}
          <section id="relations">
            <h2>{t("Relations", lang)}</h2>
            <p className="h-note">
              {t("What this card makes, and what else interacts with it.", lang)}
            </p>
            <div className="rel">
              {spawnedCards.length > 0 && (
                <div className="rel-block">
                  <div className="rl">{t("Generates", lang)}</div>
                  <div className="chips">
                    {spawnedCards.map((sc) => (
                      <Link
                        key={sc.id}
                        href={`${lp}/cards/${sc.id.toLowerCase()}`}
                        className="cardlink"
                      >
                        {sc.image_url && (
                          <img
                            className="cardimg xs"
                            src={imageUrl(sc.image_url)}
                            alt=""
                            crossOrigin="anonymous"
                          />
                        )}
                        <span>
                          <span className="cln">{sc.name}</span>
                          <span className="cls">{sc.type}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <RelatedCards
                currentId={id}
                keywords={displayKeywords}
                tags={card.tags}
                color={card.color}
              />
            </div>
          </section>

          {/* Version history + localized names */}
          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="cards" entityId={id} />
            <EntityHistory entityType="cards" entityId={id} />
          </section>
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            <img
              key={renderSrc}
              className="cardimg render cardframe"
              src={renderSrc}
              alt={`${card.name}${isUpgraded ? "+" : ""} - Slay the Spire 2`}
              crossOrigin="anonymous"
              onError={(e) => {
                const el = e.currentTarget;
                if (enchActive) {
                  if (!el.dataset.fb) {
                    el.dataset.fb = "1";
                    el.src = enchantedCardUrl(card.id.toLowerCase(), selectedEnch, false, channel, lang);
                  }
                } else if (!betaArt && !variantImg) {
                  setCardImgFailed(true);
                }
              }}
            />

            {/* Variant switcher */}
            <div className="variant">
              {hasUpgrade && (
                <div className="seg" role="group" aria-label={t("Card version", lang)}>
                  <button
                    type="button"
                    className={`segbtn${!upgraded ? " on" : ""}`}
                    onClick={() => setUpgraded(false)}
                  >
                    {t("Normal", lang)}
                  </button>
                  <button
                    type="button"
                    className={`segbtn${upgraded ? " on" : ""}`}
                    onClick={() => setUpgraded(true)}
                  >
                    {t("Upgraded", lang)}
                  </button>
                </div>
              )}

              {cardEnchantments.length > 0 && (
                <select
                  className="ench-select"
                  aria-label={t("Enchantment", lang)}
                  value={selectedEnch}
                  onChange={(e) => setSelectedEnch(e.target.value)}
                >
                  <option value="none">{t("No enchantment", lang)}</option>
                  {cardEnchantments.map((eid) => (
                    <option key={eid} value={eid}>
                      {enchMeta[eid]?.name ?? eid}
                    </option>
                  ))}
                </select>
              )}

              {hasBetaArt && (
                <button
                  type="button"
                  className={`betabtn${betaArt ? " on" : ""}`}
                  aria-pressed={betaArt}
                  onClick={() => setBetaArt(!betaArt)}
                >
                  {t("Beta art", lang)}
                </button>
              )}

              <div className="variant-cap">
                {enchActive ? (
                  <>
                    {enchMeta[selectedEnch]?.name ?? selectedEnch}
                    {isUpgraded ? " + Upgraded" : ""}
                  </>
                ) : betaArt ? (
                  <>
                    Beta art{isUpgraded ? " + Upgraded" : ""}
                  </>
                ) : (
                  <>
                    {isUpgraded ? "Upgraded" : "Normal"}
                    {activeVariant ? ` · ${activeVariant.type}` : ""} render
                  </>
                )}
              </div>
            </div>

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                <div className="frow">
                  <dt>{t("Energy", lang)}</dt>
                  <dd>{costLabel}</dd>
                </div>
                {(card.star_cost != null || card.is_x_star_cost) && (
                  <div className="frow">
                    <dt>{t("Star Cost", lang)}</dt>
                    <dd>{card.is_x_star_cost ? "X" : card.star_cost}</dd>
                  </div>
                )}
                <div className="frow">
                  <dt>{t("Type", lang)}</dt>
                  <dd>{displayType}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Rarity", lang)}</dt>
                  <dd>{card.rarity}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Character", lang)}</dt>
                  <dd style={{ color: "var(--spine)" }}>{characterLabel}</dd>
                </div>
                {targetLabel && (
                  <div className="frow">
                    <dt>{t("Target", lang)}</dt>
                    <dd>{targetLabel}</dd>
                  </div>
                )}
                {displayKeywords.length > 0 && (
                  <div className="frow">
                    <dt>{t("Keywords", lang)}</dt>
                    <dd>
                      {displayKeywords.map((kw) => (
                        <span className="kw" key={kw}>
                          {kw}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {spawnedCards.length > 0 && (
                  <div className="frow">
                    <dt>{t("Generates", lang)}</dt>
                    <dd>
                      {spawnedCards.map((sc, i) => (
                        <span key={sc.id}>
                          {i > 0 ? ", " : ""}
                          <Link href={`${lp}/cards/${sc.id.toLowerCase()}`}>{sc.name}</Link>
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {priceRange && (
                  <div className="frow">
                    <dt>{t("Merchant Price", lang)}</dt>
                    <dd>
                      <img
                        src={imageUrl("/static/images/ui/rewards/reward_icon_money.webp")}
                        alt="Gold"
                        style={{ width: 15, height: 15 }}
                        crossOrigin="anonymous"
                      />
                      {priceRange.min}&ndash;{priceRange.max}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Community mini-stats */}
            {miniStats && miniStats.picks > 0 && (
              <div className="mini">
                <div className="mh">{t("Community", lang)}</div>
                <div className="mg">
                  <div>
                    <div
                      className="mv"
                      style={{ color: miniStats.win_rate >= 50 ? "var(--good)" : "var(--warn)" }}
                    >
                      {miniStats.win_rate}%
                    </div>
                    <div className="ml">{t("Win rate", lang)}</div>
                  </div>
                  <div>
                    <div className="mv">{miniStats.pick_rate}%</div>
                    <div className="ml">{t("Pick rate", lang)}</div>
                  </div>
                  {miniStats.score != null && (
                    <div>
                      <div className="mv">{miniStats.score}</div>
                      <div className="ml">{t("Codex Score", lang)}</div>
                    </div>
                  )}
                  {miniStats.elo != null && (
                    <div>
                      <div className="mv">{Math.round(miniStats.elo)}</div>
                      <div className="ml">Elo</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
