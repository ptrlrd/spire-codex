import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, langQuery, localeOf, localePath, type Locale } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { CSSProperties } from "react";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { imageUrl } from "@/lib/image-url";
import MerchantToc from "./MerchantToc";
import "@/app/card-revamp.css";
import "@/app/meta-extra.css";
import "@/app/relic-potion-extra.css";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RarityRange {
  base: number;
  min: number;
  max: number;
}

interface MerchantConfig {
  cards: {
    by_rarity: Record<string, RarityRange>;
    colorless_markup: number;
    on_sale_divisor: number;
    variance: { min: number; max: number };
  };
  potions: {
    by_rarity: Record<string, RarityRange>;
    variance: { min: number; max: number };
  };
  relics: {
    by_rarity: Record<string, RarityRange>;
    variance: { min: number; max: number };
  };
  card_removal: {
    base_cost: number;
    price_increase: number;
    inflation_ascension: {
      level: string;
      base_cost: number;
      price_increase: number;
    };
  };
  fake_merchant: {
    relic_cost: number;
  };
}

// Hardcoded fallback used only when /api/merchant/config is unreachable
// at build/render time. Values mirror what merchant_parser.py extracts,
// kept in sync by running parse_all.py before any release. The fallback
// exists purely so a backend outage doesn't break the page render.
const FALLBACK_CONFIG: MerchantConfig = {
  cards: {
    by_rarity: {
      Common: { base: 50, min: 48, max: 52 },
      Uncommon: { base: 75, min: 71, max: 79 },
      Rare: { base: 150, min: 142, max: 158 },
    },
    colorless_markup: 1.15,
    on_sale_divisor: 2,
    variance: { min: 0.95, max: 1.05 },
  },
  potions: {
    by_rarity: {
      Common: { base: 50, min: 48, max: 52 },
      Uncommon: { base: 75, min: 71, max: 79 },
      Rare: { base: 100, min: 95, max: 105 },
    },
    variance: { min: 0.95, max: 1.05 },
  },
  relics: {
    by_rarity: {
      Common: { base: 175, min: 149, max: 201 },
      Uncommon: { base: 225, min: 191, max: 259 },
      Rare: { base: 275, min: 234, max: 316 },
      Shop: { base: 200, min: 170, max: 230 },
    },
    variance: { min: 0.85, max: 1.15 },
  },
  card_removal: {
    base_cost: 75,
    price_increase: 25,
    inflation_ascension: { level: "Inflation", base_cost: 100, price_increase: 50 },
  },
  fake_merchant: { relic_cost: 50 },
};

async function fetchMerchantConfig(): Promise<MerchantConfig> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/merchant/config`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK_CONFIG;
    return (await res.json()) as MerchantConfig;
  } catch {
    return FALLBACK_CONFIG;
  }
}

interface RarityWords {
  card_rarities?: Record<string, string>;
  relic_rarities?: Record<string, string>;
  potion_rarities?: Record<string, string>;
}

async function fetchRarityWords(locale: Locale): Promise<RarityWords> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/translations${langQuery(locale)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    return (await res.json()) as RarityWords;
  } catch {
    return {};
  }
}

async function fetchRelicNames(locale: Locale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics${langQuery(locale)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const relics = (await res.json()) as { id: string; name: string }[];
    const names: Record<string, string> = {};
    for (const r of relics) names[r.id.toUpperCase()] = r.name;
    return names;
  } catch {
    return {};
  }
}

const BLACKLISTED = ["THE_COURIER", "OLD_COIN", "LUCKY_FYSH", "BOWLER_HAT", "AMETHYST_AUBERGINE"];

const FAKE_RELICS: { fakeId: string; realId: string | null; realName: string; effect: string }[] = [
  { fakeId: "FAKE_ANCHOR", realId: "ANCHOR", realName: "Anchor", effect: "Gain 4 Block at the start of combat (real: 10)" },
  { fakeId: "FAKE_BLOOD_VIAL", realId: "BLOOD_VIAL", realName: "Blood Vial", effect: "Heal 1 HP at the start of turn 1 only" },
  { fakeId: "FAKE_HAPPY_FLOWER", realId: "HAPPY_FLOWER", realName: "Happy Flower", effect: "Gain 1 Energy every 5 turns (real: every 3)" },
  { fakeId: "FAKE_LEES_WAFFLE", realId: "LEES_WAFFLE", realName: "Lee's Waffle", effect: "Heal 10% Max HP on pickup (real: raise Max HP)" },
  { fakeId: "FAKE_MANGO", realId: "MANGO", realName: "Mango", effect: "Gain 3 Max HP on pickup (real: 14)" },
  { fakeId: "FAKE_ORICHALCUM", realId: "ORICHALCUM", realName: "Orichalcum", effect: "Gain 3 Block at end of turn if no Block (real: 6)" },
  { fakeId: "FAKE_SNECKO_EYE", realId: "SNECKO_EYE", realName: "Snecko Eye", effect: "Applies Confused (randomizes card costs) with no draw bonus" },
  { fakeId: "FAKE_STRIKE_DUMMY", realId: "STRIKE_DUMMY", realName: "Strike Dummy", effect: "Strike cards deal 1 extra damage (real: 3)" },
  { fakeId: "FAKE_VENERABLE_TEA_SET", realId: "VENERABLE_TEA_SET", realName: "Venerable Tea Set", effect: "Gain 1 Energy next combat after resting (real: 2)" },
  { fakeId: "FAKE_MERCHANTS_RUG", realId: null, realName: "Merchant's Rug", effect: "No effect. Purely decorative." },
];

// Display order for the rarity tiers, matches the previous hand-coded
// page so we don't surprise readers with a different sort. Rarities not
// in this list fall through alphabetically at the end.
const CARD_RARITY_ORDER = ["Common", "Uncommon", "Rare"];
const POTION_RARITY_ORDER = ["Common", "Uncommon", "Rare"];
const RELIC_RARITY_ORDER = ["Common", "Shop", "Uncommon", "Rare"];

function sortByOrder(rarities: string[], order: string[]): string[] {
  return [...rarities].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

const RARITY_COLOR: Record<string, string> = {
  Common: "text-[var(--text-secondary)]",
  Shop: "text-success",
  Uncommon: "text-info",
  Rare: "text-[var(--accent-gold)]",
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/merchant", title: t("Merchant Guide - Prices, Card Removal & Fake Merchant"), description: t("merchant_meta_description") });
}

export default async function MerchantPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Merchant Guide"));
  const [cfg, rarityWords, relicNames] = await Promise.all([fetchMerchantConfig(), fetchRarityWords(locale), fetchRelicNames(locale)]);
  const blacklisted = BLACKLISTED.map((id) => relicNames[id] ?? id).join(", ");
  const rarityLabel = (kind: "card" | "relic" | "potion", rarity: string) =>
    rarityWords[`${kind}_rarities`]?.[rarity] ?? t(rarity);

  const jsonLd = [
    ...buildDetailPageJsonLd({
      name: "Merchant Guide",
      description: "Complete Slay the Spire 2 (sts2) merchant price guide with card, relic, and potion costs, card removal pricing, and Fake Merchant relic details.",
      path: localePath(locale, "/merchant"),
      inLanguage: inLanguageOf(locale),
      category: "Guide",
      breadcrumbs: [
        { name: t("Home"), href: localePath(locale, "/") },
        { name: t("Merchant Guide"), href: localePath(locale, "/merchant") },
      ],
    }),
    buildFAQPageJsonLd([
      {
        question: "How much do cards cost at the merchant in Slay the Spire 2?",
        answer: `Common cards cost ${cfg.cards.by_rarity.Common.min}-${cfg.cards.by_rarity.Common.max} gold, Uncommon ${cfg.cards.by_rarity.Uncommon.min}-${cfg.cards.by_rarity.Uncommon.max} gold, Rare ${cfg.cards.by_rarity.Rare.min}-${cfg.cards.by_rarity.Rare.max} gold. Colorless cards have a ${Math.round((cfg.cards.colorless_markup - 1) * 100)}% markup. One random card is on sale for half price.`,
      },
      {
        question: "How much do relics cost at the shop in Slay the Spire 2?",
        answer: `Common relics cost ${cfg.relics.by_rarity.Common.min}-${cfg.relics.by_rarity.Common.max} gold, Uncommon ${cfg.relics.by_rarity.Uncommon.min}-${cfg.relics.by_rarity.Uncommon.max} gold, Rare ${cfg.relics.by_rarity.Rare.min}-${cfg.relics.by_rarity.Rare.max} gold, and Shop relics ${cfg.relics.by_rarity.Shop.min}-${cfg.relics.by_rarity.Shop.max} gold. Major Update #1 (v0.103.2) reduced every relic base price by 25 gold.`,
      },
      {
        question: "How much does card removal cost in Slay the Spire 2?",
        answer: `Card removal starts at ${cfg.card_removal.base_cost} gold and increases by ${cfg.card_removal.price_increase} gold each time you use it. At Ascension 6 and above, the Inflation modifier raises the base to ${cfg.card_removal.inflation_ascension.base_cost} gold and the increment to ${cfg.card_removal.inflation_ascension.price_increase} gold (${cfg.card_removal.inflation_ascension.base_cost}, ${cfg.card_removal.inflation_ascension.base_cost + cfg.card_removal.inflation_ascension.price_increase}, ${cfg.card_removal.inflation_ascension.base_cost + 2 * cfg.card_removal.inflation_ascension.price_increase}, ...).`,
      },
      {
        question: "What is the Fake Merchant in Slay the Spire 2?",
        answer: `The Fake Merchant is an event that sells counterfeit versions of popular relics for only ${cfg.fake_merchant.relic_cost} gold each. These fakes have weaker effects than the originals.`,
      },
    ]),
  ];

  const variancePct = (v: { min: number; max: number }) =>
    `±${Math.round(((v.max - v.min) / 2) * 100)}%`;

  // "From" values for the infobox: cheapest base per category. Relics take the
  // lowest base across rarities so a cheaper Shop relic wins over Common.
  const cardsFrom = cfg.cards.by_rarity.Common.base;
  const potionsFrom = cfg.potions.by_rarity.Common.base;
  const relicsFrom = Math.min(...Object.values(cfg.relics.by_rarity).map((r) => r.base));
  const cardRemovalFrom = cfg.card_removal.base_cost;
  const colorlessMarkupPct = Math.round((cfg.cards.colorless_markup - 1) * 100);
  const onSalePct = Math.round(100 / cfg.cards.on_sale_divisor);

  const ordinal = (i: number) => (i === 0 ? t("1st") : i === 1 ? t("2nd") : i === 2 ? t("3rd") : t("{n}th", { n: i + 1 }));

  const coin = (
    <img
      src={imageUrl("/static/images/ui/rewards/reward_icon_money.webp")}
      alt={t("Gold")}
      style={{ width: 15, height: 15 }}
      crossOrigin="anonymous"
    />
  );

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": "var(--accent-gold)",
        "--entity-bg": `url("${imageUrl("/static/images/misc/merchant.webp")}?bg")`,
      } as CSSProperties}
    >
      <JsonLd data={jsonLd} />

      <div className="wrap">
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Reference")}</span>
              <span>&middot;</span>
              <span>{t("Economy")}</span>
            </p>
            <h1>{heading}</h1>
            <p className="lede">
              {t("All merchant pricing extracted from the game source code. Prices vary within the listed ranges due to a per-seed random multiplier.")}
            </p>
          </div>

          {/* Sticky ToC */}
          <MerchantToc
            items={[
              { id: "shop-inventory", label: t("Shop Inventory") },
              { id: "card-prices", label: t("Card Prices") },
              { id: "relic-prices", label: t("Relic Prices") },
              { id: "potion-prices", label: t("Potion Prices") },
              { id: "card-removal", label: t("Card Removal") },
              { id: "fake-merchant", label: t("Fake Merchant") },
              { id: "technical-notes", label: t("Technical Notes") },
            ]}
          />

          {/* Shop Inventory Structure */}
          <section id="shop-inventory" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Shop Inventory")}</h2>
            <p className="h-note">
              {t("Each merchant stocks the following items, randomly generated from your seed:")}
            </p>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">{t("Character Cards")}</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;5</span>
              </div>
              <p className="tr-desc">{t("2 Attacks, 2 Skills, 1 Power, from your character pool. One random card is on sale for half price.")}</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">{t("Colorless Cards")}</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;2</span>
              </div>
              <p className="tr-desc">{t("1 Uncommon, 1 Rare, from the colorless pool. {pct}% price markup.", { pct: colorlessMarkupPct })}</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">{t("Relics")}</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;3</span>
              </div>
              <p className="tr-desc">{t("2 random rarity rolls + 1 guaranteed Shop relic. {list} are blacklisted (gold-generating relics removed in Major Update #1).", { list: blacklisted })}</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">{t("Potions")}</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;3</span>
              </div>
              <p className="tr-desc">{t("3 random potions from the available pool.")}</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">{t("Card Removal")}</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;1</span>
              </div>
              <p className="tr-desc">{t("Remove a card from your deck. Price increases each time.")}</p>
            </div>
          </section>

          {/* Card Prices */}
          <section id="card-prices" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Card Prices")}</h2>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">{t("Rarity")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Base")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Range")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Colorless")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("On Sale")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortByOrder(Object.keys(cfg.cards.by_rarity), CARD_RARITY_ORDER).map((rarity, i, arr) => {
                    const r = cfg.cards.by_rarity[rarity];
                    const colorlessMin = Math.round(r.min * cfg.cards.colorless_markup);
                    const colorlessMax = Math.round(r.max * cfg.cards.colorless_markup);
                    const saleMin = Math.round(r.min / cfg.cards.on_sale_divisor);
                    const saleMax = Math.round(r.max / cfg.cards.on_sale_divisor);
                    return (
                      <tr key={rarity} className={i < arr.length - 1 ? "border-b border-[var(--border-subtle)]/50" : ""}>
                        <td className={`p-3 ${RARITY_COLOR[rarity] ?? "text-[var(--text-secondary)]"}`}>{rarityLabel("card", rarity)}</td>
                        <td className="p-3 text-right text-[var(--text-primary)]">{r.base}</td>
                        <td className="p-3 text-right text-[var(--accent-gold)]">{r.min}–{r.max}</td>
                        <td className="p-3 text-right text-[var(--text-secondary)]">{colorlessMin}–{colorlessMax}</td>
                        <td className="p-3 text-right text-success">{saleMin}–{saleMax}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
                {t("Range: base × random({min}–{max}). Colorless: +{pct}% markup. On sale: {sale}% off.", { min: cfg.cards.variance.min, max: cfg.cards.variance.max, pct: colorlessMarkupPct, sale: onSalePct })}
              </div>
            </div>
          </section>

          {/* Relic Prices */}
          <section id="relic-prices" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Relic Prices")}</h2>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">{t("Rarity")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Base")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Range")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Multiplier")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortByOrder(Object.keys(cfg.relics.by_rarity), RELIC_RARITY_ORDER).map((rarity, i, arr) => {
                    const r = cfg.relics.by_rarity[rarity];
                    return (
                      <tr key={rarity} className={i < arr.length - 1 ? "border-b border-[var(--border-subtle)]/50" : ""}>
                        <td className={`p-3 ${RARITY_COLOR[rarity] ?? "text-[var(--text-secondary)]"}`}>{rarityLabel("relic", rarity)}</td>
                        <td className="p-3 text-right text-[var(--text-primary)]">{r.base}</td>
                        <td className="p-3 text-right text-[var(--accent-gold)]">{r.min}–{r.max}</td>
                        <td className="p-3 text-right text-[var(--text-muted)]">×{cfg.relics.variance.min}–{cfg.relics.variance.max}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
                {t("Relics have a wider price variance ({relicVar}) than cards ({cardVar}). Major Update #1 (v0.103.2) reduced every relic base by 25 gold. Five relics are blacklisted from the shop pool: {list}.", { relicVar: variancePct(cfg.relics.variance), cardVar: variancePct(cfg.cards.variance), list: blacklisted })}
              </div>
            </div>
          </section>

          {/* Potion Prices */}
          <section id="potion-prices" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Potion Prices")}</h2>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">{t("Rarity")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Base")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Range")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortByOrder(Object.keys(cfg.potions.by_rarity), POTION_RARITY_ORDER).map((rarity, i, arr) => {
                    const r = cfg.potions.by_rarity[rarity];
                    return (
                      <tr key={rarity} className={i < arr.length - 1 ? "border-b border-[var(--border-subtle)]/50" : ""}>
                        <td className={`p-3 ${RARITY_COLOR[rarity] ?? "text-[var(--text-secondary)]"}`}>{rarityLabel("potion", rarity)}</td>
                        <td className="p-3 text-right text-[var(--text-primary)]">{r.base}</td>
                        <td className="p-3 text-right text-[var(--accent-gold)]">{r.min}–{r.max}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
                {t("Range: base × random({min}–{max}). Same variance as cards.", { min: cfg.potions.variance.min, max: cfg.potions.variance.max })}
              </div>
            </div>
          </section>

          {/* Card Removal */}
          <section id="card-removal" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Card Removal")}</h2>
            <p className="h-note">
              {t("The merchant offers card removal at an escalating price. The cost increases each time you use it during the run. No random variance.")}
            </p>

            <h3 className="subh">{t("Ascension 0–5")}</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="tile" style={{ textAlign: "center" }}>
                  <div className="k">{ordinal(i)}</div>
                  <div className="v" style={{ color: "var(--accent-gold)" }}>
                    {cfg.card_removal.base_cost + cfg.card_removal.price_increase * i}
                  </div>
                  <div className="s">{t("gold")}</div>
                </div>
              ))}
            </div>
            <p className="meta-note">
              {t("Formula: {base} + ({inc} × removals used).", { base: cfg.card_removal.base_cost, inc: cfg.card_removal.price_increase })}
            </p>

            <h3 className="subh">
              {t("Ascension 6+")}, <span style={{ color: "var(--accent-gold)" }}>{cfg.card_removal.inflation_ascension.level}</span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="tile" style={{ textAlign: "center" }}>
                  <div className="k">{ordinal(i)}</div>
                  <div className="v" style={{ color: "var(--accent-gold)" }}>
                    {cfg.card_removal.inflation_ascension.base_cost + cfg.card_removal.inflation_ascension.price_increase * i}
                  </div>
                  <div className="s">{t("gold")}</div>
                </div>
              ))}
            </div>
            <p className="meta-note">
              {t("Formula: {base} + ({inc} × removals used).", { base: cfg.card_removal.inflation_ascension.base_cost, inc: cfg.card_removal.inflation_ascension.price_increase })}{" "}
              {t("Major Update #1 reworked Ascension 6 from {old} to {level}, raising the base by {gold} gold and the per-use increment by {inc}.", { old: t("Gloom (less rest sites)"), level: cfg.card_removal.inflation_ascension.level, gold: cfg.card_removal.inflation_ascension.base_cost - cfg.card_removal.base_cost, inc: cfg.card_removal.inflation_ascension.price_increase - cfg.card_removal.price_increase })}
            </p>
          </section>

          {/* Fake Merchant */}
          <section id="fake-merchant" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Fake Merchant")}</h2>
            <p className="h-note">
              {t("The Fake Merchant is an event that sells counterfeit relics for a flat {cost} gold each. These are weaker versions of well-known relics. All fake relics have Event rarity.", { cost: cfg.fake_merchant.relic_cost })}
            </p>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">{t("Fake Relic")}</th>
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">{t("Mimics")}</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">{t("Price")}</th>
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">{t("Effect")}</th>
                  </tr>
                </thead>
                <tbody>
                  {FAKE_RELICS.map((row) => (
                    {
                      fakeId: row.fakeId,
                      fake: relicNames[row.fakeId] ?? t("Fake {relic}", { relic: row.realName }),
                      real: row.realId ? relicNames[row.realId] ?? row.realName : "—",
                      effect: t(row.effect),
                    }
                  )).map((row) => (
                    <tr key={row.fakeId} className="border-b border-[var(--border-subtle)]/50 last:border-0">
                      <td className="p-3 text-[var(--text-primary)] font-medium">{row.fake}</td>
                      <td className="p-3 text-[var(--text-muted)]">{row.real}</td>
                      <td className="p-3 text-right text-[var(--accent-gold)]">{cfg.fake_merchant.relic_cost}g</td>
                      <td className="p-3 text-[var(--text-secondary)]">{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Technical Notes */}
          <section id="technical-notes" style={{ scrollMarginTop: 84 }}>
            <h2>{t("Technical Notes")}</h2>
            <div className="trow">
              <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                <p>
                  {t("All prices come from a seeded random number generator, meaning prices are deterministic per seed.")} {t("Random number generator:")} <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops</code>
                </p>
                <p>
                  {t("Cards use {call} for a {pct} variance.", { call: `NextFloat(${cfg.cards.variance.min}f, ${cfg.cards.variance.max}f)`, pct: variancePct(cfg.cards.variance) })}{" "}
                  {t("Relics use {call} for a wider {pct} variance.", { call: `NextFloat(${cfg.relics.variance.min}f, ${cfg.relics.variance.max}f)`, pct: variancePct(cfg.relics.variance) })}{" "}
                  {t("Potions use the same {pct} variance as cards.", { pct: variancePct(cfg.potions.variance) })}
                </p>
                <p>
                  {t("The shop randomly picks one of the 5 character cards to put on sale ({pct}% off).", { pct: onSalePct })} {t("The sale slot is determined by:")} <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops.NextInt(5)</code>
                </p>
                <p>
                  {t("When you buy an item, the slot is emptied. Items only restock if you have The Courier relic, which refills purchased slots with new random items (excluding duplicates already in the shop).")}
                </p>
              </div>
            </div>
          </section>
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            <img
              className="cardimg render relimg"
              src={imageUrl("/static/images/misc/merchant.webp")}
              alt={t("Merchant")}
              crossOrigin="anonymous"
            />
            <div className="facts">
              <div className="fh">{t("At a glance")}</div>
              <dl>
                <div className="frow"><dt>{t("Cards from")}</dt><dd>{coin}{cardsFrom}g</dd></div>
                <div className="frow"><dt>{t("Relics from")}</dt><dd>{coin}{relicsFrom}g</dd></div>
                <div className="frow"><dt>{t("Potions from")}</dt><dd>{coin}{potionsFrom}g</dd></div>
                <div className="frow"><dt>{t("Card removal")}</dt><dd>{coin}{cardRemovalFrom}g</dd></div>
                <div className="frow"><dt>{t("Colorless markup")}</dt><dd>+{colorlessMarkupPct}%</dd></div>
                <div className="frow"><dt>{t("On sale")}</dt><dd>{t("{pct}% off", { pct: onSalePct })}</dd></div>
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
