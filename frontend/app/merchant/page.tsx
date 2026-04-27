import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

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
// at build/render time. Values mirror what merchant_parser.py extracts —
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

// Display order for the rarity tiers — matches the previous hand-coded
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
  Common: "text-gray-300",
  Shop: "text-emerald-400",
  Uncommon: "text-blue-400",
  Rare: "text-[var(--accent-gold)]",
};

export default async function MerchantPage() {
  const cfg = await fetchMerchantConfig();

  const jsonLd = [
    ...buildDetailPageJsonLd({
      name: "Merchant Guide",
      description: "Complete Slay the Spire 2 (StS2) merchant price guide with card, relic, and potion costs, card removal pricing, and Fake Merchant relic details.",
      path: "/merchant",
      category: "Guide",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Merchant Guide", href: "/merchant" },
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Merchant Guide
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        All merchant pricing extracted from the game source code. Prices vary within the listed ranges due to a per-seed random multiplier.
      </p>

      {/* Shop Inventory Structure */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Shop Inventory
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Each merchant stocks the following items, randomly generated from your seed:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Character Cards (5)</h3>
              <p className="text-[var(--text-muted)]">2 Attacks, 2 Skills, 1 Power — from your character pool. One random card is on sale for half price.</p>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Colorless Cards (2)</h3>
              <p className="text-[var(--text-muted)]">1 Uncommon, 1 Rare — from the colorless pool. {Math.round((cfg.cards.colorless_markup - 1) * 100)}% price markup.</p>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Relics (3)</h3>
              <p className="text-[var(--text-muted)]">2 random rarity rolls + 1 guaranteed Shop relic. The Courier, Old Coin, Lucky Fysh, Bowler Hat, and Amethyst Aubergine are blacklisted (gold-generating relics removed in Major Update #1).</p>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Potions (3)</h3>
              <p className="text-[var(--text-muted)]">3 random potions from the available pool.</p>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3 sm:col-span-2">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Card Removal (1)</h3>
              <p className="text-[var(--text-muted)]">Remove a card from your deck. Price increases each time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Card Prices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Card Prices
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
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
              {sortByOrder(Object.keys(cfg.cards.by_rarity), CARD_RARITY_ORDER).map((rarity, i, arr) => {
                const r = cfg.cards.by_rarity[rarity];
                const colorlessMin = Math.round(r.min * cfg.cards.colorless_markup);
                const colorlessMax = Math.round(r.max * cfg.cards.colorless_markup);
                const saleMin = Math.round(r.min / cfg.cards.on_sale_divisor);
                const saleMax = Math.round(r.max / cfg.cards.on_sale_divisor);
                return (
                  <tr key={rarity} className={i < arr.length - 1 ? "border-b border-[var(--border-subtle)]/50" : ""}>
                    <td className={`p-3 ${RARITY_COLOR[rarity] ?? "text-gray-300"}`}>{rarity}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">{r.base}</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">{r.min}–{r.max}</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">{colorlessMin}–{colorlessMax}</td>
                    <td className="p-3 text-right text-emerald-400">{saleMin}–{saleMax}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Range: base × random({cfg.cards.variance.min}–{cfg.cards.variance.max}). Colorless: +{Math.round((cfg.cards.colorless_markup - 1) * 100)}% markup. On sale: {Math.round(100 / cfg.cards.on_sale_divisor)}% off.
          </div>
        </div>
      </section>

      {/* Relic Prices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Relic Prices
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
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
              {sortByOrder(Object.keys(cfg.relics.by_rarity), RELIC_RARITY_ORDER).map((rarity, i, arr) => {
                const r = cfg.relics.by_rarity[rarity];
                return (
                  <tr key={rarity} className={i < arr.length - 1 ? "border-b border-[var(--border-subtle)]/50" : ""}>
                    <td className={`p-3 ${RARITY_COLOR[rarity] ?? "text-gray-300"}`}>{rarity}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">{r.base}</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">{r.min}–{r.max}</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">×{cfg.relics.variance.min}–{cfg.relics.variance.max}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Relics have a wider price variance ({variancePct(cfg.relics.variance)}) than cards ({variancePct(cfg.cards.variance)}). Major Update #1 (v0.103.2) reduced every relic base by 25 gold. Five relics are blacklisted from the shop pool: The Courier, Old Coin, Lucky Fysh, Bowler Hat, Amethyst Aubergine.
          </div>
        </div>
      </section>

      {/* Potion Prices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Potion Prices
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left p-3 text-[var(--text-muted)] font-semibold">Rarity</th>
                <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Base</th>
                <th className="text-right p-3 text-[var(--text-muted)] font-semibold">Range</th>
              </tr>
            </thead>
            <tbody>
              {sortByOrder(Object.keys(cfg.potions.by_rarity), POTION_RARITY_ORDER).map((rarity, i, arr) => {
                const r = cfg.potions.by_rarity[rarity];
                return (
                  <tr key={rarity} className={i < arr.length - 1 ? "border-b border-[var(--border-subtle)]/50" : ""}>
                    <td className={`p-3 ${RARITY_COLOR[rarity] ?? "text-gray-300"}`}>{rarity}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">{r.base}</td>
                    <td className="p-3 text-right text-[var(--accent-gold)]">{r.min}–{r.max}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Range: base × random({cfg.potions.variance.min}–{cfg.potions.variance.max}). Same variance as cards.
          </div>
        </div>
      </section>

      {/* Card Removal */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Card Removal
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            The merchant offers card removal at an escalating price. The cost increases each time you use it during the run. No random variance.
          </p>

          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Ascension 0–5</h3>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center min-w-[80px]">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                  </div>
                  <div className="text-lg font-bold text-[var(--accent-gold)]">
                    {cfg.card_removal.base_cost + cfg.card_removal.price_increase * i}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">gold</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Formula: {cfg.card_removal.base_cost} + ({cfg.card_removal.price_increase} × removals used).
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              Ascension 6+ — <span className="text-[var(--accent-gold)]">{cfg.card_removal.inflation_ascension.level}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center min-w-[80px]">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                  </div>
                  <div className="text-lg font-bold text-[var(--accent-gold)]">
                    {cfg.card_removal.inflation_ascension.base_cost + cfg.card_removal.inflation_ascension.price_increase * i}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">gold</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Formula: {cfg.card_removal.inflation_ascension.base_cost} + ({cfg.card_removal.inflation_ascension.price_increase} × removals used). Major Update #1 reworked Ascension 6 from <span className="line-through">Gloom (less rest sites)</span> to {cfg.card_removal.inflation_ascension.level}, raising the base by {cfg.card_removal.inflation_ascension.base_cost - cfg.card_removal.base_cost} gold and the per-use increment by {cfg.card_removal.inflation_ascension.price_increase - cfg.card_removal.price_increase}.
            </p>
          </div>
        </div>
      </section>

      {/* Fake Merchant */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Fake Merchant
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          The Fake Merchant is an event that sells counterfeit relics for a flat {cfg.fake_merchant.relic_cost} gold each. These are weaker versions of well-known relics. All fake relics have Event rarity.
        </p>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
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
                { fake: "Fake Anchor", real: "Anchor", effect: "Gain 4 Block at the start of combat (real: 10)" },
                { fake: "Fake Blood Vial", real: "Blood Vial", effect: "Heal 1 HP at the start of turn 1 only" },
                { fake: "Fake Happy Flower", real: "Happy Flower", effect: "Gain 1 Energy every 5 turns (real: every 3)" },
                { fake: "Fake Lee's Waffle", real: "Lee's Waffle", effect: "Heal 10% Max HP on pickup (real: raise Max HP)" },
                { fake: "Fake Mango", real: "Mango", effect: "Gain 3 Max HP on pickup (real: 14)" },
                { fake: "Fake Orichalcum", real: "Orichalcum", effect: "Gain 3 Block at end of turn if no Block (real: 6)" },
                { fake: "Fake Snecko Eye", real: "Snecko Eye", effect: "Applies Confused (randomizes card costs) with no draw bonus" },
                { fake: "Fake Strike Dummy", real: "Strike Dummy", effect: "Strike cards deal 1 extra damage (real: 3)" },
                { fake: "Fake Venerable Tea Set", real: "Venerable Tea Set", effect: "Gain 1 Energy next combat after resting (real: 2)" },
                { fake: "Fake Merchant's Rug", real: "—", effect: "No effect. Purely decorative." },
              ].map((row) => (
                <tr key={row.fake} className="border-b border-[var(--border-subtle)]/50 last:border-0">
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
      <section>
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Technical Notes
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 text-sm text-[var(--text-secondary)] space-y-3">
          <p>
            All prices use the seeded <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops</code> random number generator, meaning prices are deterministic per seed.
          </p>
          <p>
            Cards use <code className="text-[var(--accent-gold)] text-xs">NextFloat({cfg.cards.variance.min}f, {cfg.cards.variance.max}f)</code> for a {variancePct(cfg.cards.variance)} variance. Relics use <code className="text-[var(--accent-gold)] text-xs">NextFloat({cfg.relics.variance.min}f, {cfg.relics.variance.max}f)</code> for a wider {variancePct(cfg.relics.variance)} variance. Potions use the same {variancePct(cfg.potions.variance)} as cards.
          </p>
          <p>
            The shop randomly picks one of the 5 character cards to put on sale ({Math.round(100 / cfg.cards.on_sale_divisor)}% off). The sale slot is determined by <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops.NextInt(5)</code>.
          </p>
          <p>
            When you buy an item, the slot is emptied. Items only restock if you have <strong>The Courier</strong> relic, which refills purchased slots with new random items (excluding duplicates already in the shop).
          </p>
        </div>
      </section>
    </div>
  );
}
