import type { Metadata } from "next";
import type { CSSProperties } from "react";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import { imageUrl } from "@/lib/image-url";
import MerchantToc from "../../merchant/MerchantToc";
import "../../card-revamp.css";
import "../../meta-extra.css";
import "../../relic-potion-extra.css";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "merchant";
const CATEGORY_LABEL = "Merchant Guide";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `Complete ${gameName} merchant price guide with card, relic, and potion costs, card removal pricing, and Fake Merchant relic details. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/${CATEGORY}`,
    "x-default": `${SITE_URL}/${CATEGORY}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${CATEGORY}`;
  }

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/${CATEGORY}`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/${CATEGORY}`,
      languages,
    },
  };
}

export default async function LangMerchantPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];

  // Fetch game translations for rarity/type names
  interface Translations { card_types?: Record<string, string>; card_rarities?: Record<string, string>; relic_rarities?: Record<string, string>; potion_rarities?: Record<string, string>; }
  let tr: Translations = {};
  try {
    const res = await fetch(`${API}/api/translations?lang=${lang}`, { next: { revalidate: 3600 } });
    if (res.ok) tr = await res.json();
  } catch {}
  const cr = (r: string) => tr.card_rarities?.[r] ?? r;
  const rr = (r: string) => tr.relic_rarities?.[r] ?? r;
  const pr = (r: string) => tr.potion_rarities?.[r] ?? r;

  const jsonLd = [
    ...buildDetailPageJsonLd({
      name: "Merchant Guide",
      description: "Complete Slay the Spire 2 merchant price guide with card, relic, and potion costs, card removal pricing, and Fake Merchant relic details.",
      path: `/${lang}/merchant`,
      category: "Guide",
      breadcrumbs: [
        { name: "Home", href: `/${lang}` },
        { name: "Merchant Guide", href: `/${lang}/merchant` },
      ],
      inLanguage: LANG_HREFLANG[langCode],
    }),
    buildFAQPageJsonLd([
      { question: `How much do cards cost at the merchant in ${gameName}?`, answer: "Common cards cost 48-53 gold, Uncommon 71-79 gold, Rare 143-158 gold. Colorless cards have a 15% markup. One random card is on sale for half price." },
      { question: `How much do relics cost at the shop in ${gameName}?`, answer: "Common relics cost 149-201 gold, Uncommon 191-259 gold, Rare 234-316 gold, and Shop relics 170-230 gold. Major Update #1 (v0.103.2) reduced every relic base price by 25 gold." },
      { question: `How much does card removal cost in ${gameName}?`, answer: "Card removal starts at 75 gold and increases by 25 gold each time you use it. At Ascension 6 and above, the Inflation modifier raises the base to 100 gold and the increment to 50 gold (100, 150, 200, ...)." },
      { question: `What is the Fake Merchant in ${gameName}?`, answer: "The Fake Merchant is an event that sells counterfeit versions of popular relics for only 50 gold each. These fakes have weaker effects than the originals." },
    ]),
  ];

  const coin = (
    <img
      src={imageUrl("/static/images/ui/rewards/reward_icon_money.webp")}
      alt="Gold"
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
              <span>Reference</span>
              <span>&middot;</span>
              <span>Economy</span>
            </p>
            <h1>{t("Merchant Guide", lang)}</h1>
            <p className="lede">
              {t("merchant_tagline", lang)}
            </p>
          </div>

          {/* Sticky ToC */}
          <MerchantToc
            items={[
              { id: "shop-inventory", label: t("Shop Inventory", lang) },
              { id: "card-prices", label: t("Card Prices", lang) },
              { id: "relic-prices", label: t("Relic Prices", lang) },
              { id: "potion-prices", label: t("Potion Prices", lang) },
              { id: "card-removal", label: t("Card Removal", lang) },
              { id: "fake-merchant", label: t("Fake Merchant", lang) },
              { id: "technical-notes", label: t("Technical Notes", lang) },
            ]}
          />

          {/* Shop Inventory Structure */}
          <section id="shop-inventory" style={{ scrollMarginTop: 84 }}>
            <h2>Shop Inventory</h2>
            <p className="h-note">
              Each merchant stocks the following items, randomly generated from your seed:
            </p>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">Character Cards</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;5</span>
              </div>
              <p className="tr-desc">2 Attacks, 2 Skills, 1 Power, from your character pool. One random card is on sale for half price.</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">Colorless Cards</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;2</span>
              </div>
              <p className="tr-desc">1 Uncommon, 1 Rare, from the colorless pool. 15% price markup.</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">Relics</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;3</span>
              </div>
              <p className="tr-desc">2 random rarity rolls + 1 guaranteed Shop relic. The Courier, Old Coin, Lucky Fysh, Bowler Hat, and Amethyst Aubergine are blacklisted (gold-generating relics removed in Major Update #1).</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">Potions</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;3</span>
              </div>
              <p className="tr-desc">3 random potions from the available pool.</p>
            </div>
            <div className="trow">
              <div className="tr-head">
                <span className="tr-title">Card Removal</span>
                <span className="tr-rarity" style={{ color: "var(--accent-gold)" }}>&times;1</span>
              </div>
              <p className="tr-desc">Remove a card from your deck. Price increases each time.</p>
            </div>
          </section>

          {/* Card Prices */}
          <section id="card-prices" style={{ scrollMarginTop: 84 }}>
            <h2>Card Prices</h2>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Rarity</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Base</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Range</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Colorless</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">On Sale</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-[var(--text-secondary)]">{cr("Common")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">50</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">48–53</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">55–60</td>
                    <td className="p-3 text-right text-emerald-400">24–27</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-blue-400">{cr("Uncommon")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">75</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">71–79</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">82–90</td>
                    <td className="p-3 text-right text-emerald-400">36–40</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[var(--accent-gold)]">{cr("Rare")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">150</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">143–158</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">164–181</td>
                    <td className="p-3 text-right text-emerald-400">71–79</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
                Range: base x random(0.95–1.05). Colorless: +15% markup. On sale: 50% off.
              </div>
            </div>
          </section>

          {/* Relic Prices */}
          <section id="relic-prices" style={{ scrollMarginTop: 84 }}>
            <h2>Relic Prices</h2>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Rarity</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Base</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Range</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-[var(--text-secondary)]">{rr("Common")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">175</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">149–201</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">x0.85–1.15</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-emerald-400">{rr("Shop")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">200</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">170–230</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">x0.85–1.15</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-blue-400">{rr("Uncommon")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">225</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">191–259</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">x0.85–1.15</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[var(--accent-gold)]">{rr("Rare")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">275</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">234–316</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">x0.85–1.15</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
                Relics have a wider price variance (+-15%) than cards (+-5%). Major Update #1 (v0.103.2) reduced every relic base by 25 gold. Five relics are blacklisted from the shop pool: The Courier, Old Coin, Lucky Fysh, Bowler Hat, Amethyst Aubergine.
              </div>
            </div>
          </section>

          {/* Potion Prices */}
          <section id="potion-prices" style={{ scrollMarginTop: 84 }}>
            <h2>Potion Prices</h2>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Rarity</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Base</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Range</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-[var(--text-secondary)]">{pr("Common")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">50</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">48–53</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]/50">
                    <td className="p-3 text-blue-400">{pr("Uncommon")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">75</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">71–79</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[var(--accent-gold)]">{pr("Rare")}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">100</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">95–105</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
                Range: base x random(0.95–1.05). Same variance as cards.
              </div>
            </div>
          </section>

          {/* Card Removal */}
          <section id="card-removal" style={{ scrollMarginTop: 84 }}>
            <h2>Card Removal</h2>
            <p className="h-note">
              The merchant offers card removal at an escalating price. The cost increases each time you use it during the run. No random variance.
            </p>

            <h3 className="subh">Ascension 0–5</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="tile" style={{ textAlign: "center" }}>
                  <div className="k">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                  </div>
                  <div className="v" style={{ color: "var(--accent-gold)" }}>
                    {75 + 25 * i}
                  </div>
                  <div className="s">gold</div>
                </div>
              ))}
            </div>
            <p className="meta-note">
              Formula: 75 + (25 x removals used).
            </p>

            <h3 className="subh">
              Ascension 6+, <span style={{ color: "var(--accent-gold)" }}>Inflation</span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="tile" style={{ textAlign: "center" }}>
                  <div className="k">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                  </div>
                  <div className="v" style={{ color: "var(--accent-gold)" }}>
                    {100 + 50 * i}
                  </div>
                  <div className="s">gold</div>
                </div>
              ))}
            </div>
            <p className="meta-note">
              Formula: 100 + (50 x removals used). Major Update #1 reworked Ascension 6 from <span className="line-through">Gloom (less rest sites)</span> to Inflation, raising the base by 25 gold and the per-use increment by 25.
            </p>
          </section>

          {/* Fake Merchant */}
          <section id="fake-merchant" style={{ scrollMarginTop: 84 }}>
            <h2>Fake Merchant</h2>
            <p className="h-note">
              The Fake Merchant is an event that sells counterfeit relics for a flat 50 gold each. These are weaker versions of well-known relics. All fake relics have Event rarity.
            </p>
            <div className="facts overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Fake Relic</th>
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Mimics</th>
                    <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Price</th>
                    <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { fake: "Fake Anchor", real: "Anchor", price: 50, effect: "Gain 4 Block at the start of combat (real: 10)" },
                    { fake: "Fake Blood Vial", real: "Blood Vial", price: 50, effect: "Heal 1 HP at the start of turn 1 only" },
                    { fake: "Fake Happy Flower", real: "Happy Flower", price: 50, effect: "Gain 1 Energy every 5 turns (real: every 3)" },
                    { fake: "Fake Lee's Waffle", real: "Lee's Waffle", price: 50, effect: "Heal 10% Max HP on pickup (real: raise Max HP)" },
                    { fake: "Fake Mango", real: "Mango", price: 50, effect: "Gain 3 Max HP on pickup (real: 14)" },
                    { fake: "Fake Orichalcum", real: "Orichalcum", price: 50, effect: "Gain 3 Block at end of turn if no Block (real: 6)" },
                    { fake: "Fake Snecko Eye", real: "Snecko Eye", price: 50, effect: "Applies Confused (randomizes card costs) with no draw bonus" },
                    { fake: "Fake Strike Dummy", real: "Strike Dummy", price: 50, effect: "Strike cards deal 1 extra damage (real: 3)" },
                    { fake: "Fake Venerable Tea Set", real: "Venerable Tea Set", price: 50, effect: "Gain 1 Energy next combat after resting (real: 2)" },
                    { fake: "Fake Merchant's Rug", real: "\u2014", price: 50, effect: "No effect. Purely decorative." },
                  ].map((row) => (
                    <tr key={row.fake} className="border-b border-[var(--border-subtle)]/50 last:border-0">
                      <td className="p-3 text-[var(--text-primary)] font-medium">{row.fake}</td>
                      <td className="p-3 text-[var(--text-muted)]">{row.real}</td>
                      <td className="p-3 text-right text-[var(--accent-gold)]">{row.price}g</td>
                      <td className="p-3 text-[var(--text-secondary)]">{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Technical Notes */}
          <section id="technical-notes" style={{ scrollMarginTop: 84 }}>
            <h2>Technical Notes</h2>
            <div className="trow">
              <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                <p>
                  All prices use the seeded <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops</code> random number generator, meaning prices are deterministic per seed.
                </p>
                <p>
                  Cards use <code className="text-[var(--accent-gold)] text-xs">NextFloat(0.95f, 1.05f)</code> for a +-5% variance. Relics use <code className="text-[var(--accent-gold)] text-xs">NextFloat(0.85f, 1.15f)</code> for a wider +-15% variance. Potions use the same +-5% as cards.
                </p>
                <p>
                  The shop randomly picks one of the 5 character cards to put on sale (50% off). The sale slot is determined by <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops.NextInt(5)</code>.
                </p>
                <p>
                  When you buy an item, the slot is emptied. Items only restock if you have <strong>The Courier</strong> relic, which refills purchased slots with new random items (excluding duplicates already in the shop).
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
              alt="Merchant"
              crossOrigin="anonymous"
            />
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                <div className="frow"><dt>{t("Cards from", lang)}</dt><dd>{coin}50g</dd></div>
                <div className="frow"><dt>{t("Relics from", lang)}</dt><dd>{coin}175g</dd></div>
                <div className="frow"><dt>{t("Potions from", lang)}</dt><dd>{coin}50g</dd></div>
                <div className="frow"><dt>{t("Card removal", lang)}</dt><dd>{coin}75g</dd></div>
                <div className="frow"><dt>{t("Colorless markup", lang)}</dt><dd>+15%</dd></div>
                <div className="frow"><dt>{t("On sale", lang)}</dt><dd>50% off</dd></div>
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
