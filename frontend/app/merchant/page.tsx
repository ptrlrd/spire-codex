import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import {
  loadMerchantConfig,
  blacklistLabel,
  colorlessRange,
  onSaleRange,
} from "@/lib/merchant-config";

export default async function MerchantPage() {
  const config = await loadMerchantConfig();
  const { cards, potions, relics, card_removal, fake_merchant } = config;
  const inflation = card_removal.ascension_inflation;
  const blacklist = blacklistLabel(relics.blacklist);
  const colorlessCommon = colorlessRange(cards.common, cards);
  const colorlessUncommon = colorlessRange(cards.uncommon, cards);
  const colorlessRare = colorlessRange(cards.rare, cards);
  const onSaleCommon = onSaleRange(cards.common, cards);
  const onSaleUncommon = onSaleRange(cards.uncommon, cards);
  const onSaleRare = onSaleRange(cards.rare, cards);
  const cardVarPct = Math.round(cards.variance.max * 100 - 100);
  const relicVarPct = Math.round(relics.variance.max * 100 - 100);
  const colorlessMarkupPct = Math.round((cards.colorless_multiplier - 1) * 100);
  const removalSchedule = (base: number, increment: number) =>
    [0, 1, 2, 3, 4, 5].map((i) => base + increment * i);

  const jsonLd = [
    ...buildDetailPageJsonLd({
      name: "Merchant Guide",
      description:
        "Complete Slay the Spire 2 merchant price guide with card, relic, and potion costs, card removal pricing, and Fake Merchant relic details.",
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
        answer: `Common cards cost ${cards.common.min}-${cards.common.max} gold, Uncommon ${cards.uncommon.min}-${cards.uncommon.max} gold, Rare ${cards.rare.min}-${cards.rare.max} gold. Colorless cards have a ${colorlessMarkupPct}% markup. One random card is on sale for half price.`,
      },
      {
        question: "How much do relics cost at the shop in Slay the Spire 2?",
        answer: `Common relics cost ${relics.common.min}-${relics.common.max} gold, Uncommon ${relics.uncommon.min}-${relics.uncommon.max} gold, Rare ${relics.rare.min}-${relics.rare.max} gold, and Shop relics ${relics.shop.min}-${relics.shop.max} gold.`,
      },
      {
        question: "How much does card removal cost in Slay the Spire 2?",
        answer: `Card removal starts at ${card_removal.base} gold and increases by ${card_removal.increment} gold each time you use it. At Ascension ${inflation.level ?? 6} and above, the ${inflation.modifier} modifier raises the base to ${inflation.base} gold and the increment to ${inflation.increment} gold.`,
      },
      {
        question: "What is the Fake Merchant in Slay the Spire 2?",
        answer: `The Fake Merchant is an event that sells counterfeit versions of popular relics for only ${fake_merchant.flat_price} gold each. These fakes have weaker effects than the originals.`,
      },
    ]),
  ];

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
              <p className="text-[var(--text-muted)]">1 Uncommon, 1 Rare — from the colorless pool. {colorlessMarkupPct}% price markup.</p>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Relics (3)</h3>
              <p className="text-[var(--text-muted)]">2 random rarity rolls + 1 guaranteed Shop relic. {blacklist} are blacklisted.</p>
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
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-gray-300">Common</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{cards.common.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{cards.common.min}–{cards.common.max}</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">{colorlessCommon.min}–{colorlessCommon.max}</td>
                <td className="p-3 text-right text-emerald-400">{onSaleCommon.min}–{onSaleCommon.max}</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-blue-400">Uncommon</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{cards.uncommon.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{cards.uncommon.min}–{cards.uncommon.max}</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">{colorlessUncommon.min}–{colorlessUncommon.max}</td>
                <td className="p-3 text-right text-emerald-400">{onSaleUncommon.min}–{onSaleUncommon.max}</td>
              </tr>
              <tr>
                <td className="p-3 text-[var(--accent-gold)]">Rare</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{cards.rare.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{cards.rare.min}–{cards.rare.max}</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">{colorlessRare.min}–{colorlessRare.max}</td>
                <td className="p-3 text-right text-emerald-400">{onSaleRare.min}–{onSaleRare.max}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Range: base × random({cards.variance.min.toFixed(2)}–{cards.variance.max.toFixed(2)}). Colorless: +{colorlessMarkupPct}% markup. On sale: {Math.round(cards.on_sale_fraction * 100)}% of base.
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
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-gray-300">Common</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{relics.common.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{relics.common.min}–{relics.common.max}</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×{relics.variance.min.toFixed(2)}–{relics.variance.max.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-emerald-400">Shop</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{relics.shop.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{relics.shop.min}–{relics.shop.max}</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×{relics.variance.min.toFixed(2)}–{relics.variance.max.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-blue-400">Uncommon</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{relics.uncommon.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{relics.uncommon.min}–{relics.uncommon.max}</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×{relics.variance.min.toFixed(2)}–{relics.variance.max.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="p-3 text-[var(--accent-gold)]">Rare</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{relics.rare.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{relics.rare.min}–{relics.rare.max}</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×{relics.variance.min.toFixed(2)}–{relics.variance.max.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Relics have a wider price variance (±{relicVarPct}%) than cards (±{cardVarPct}%). {relics.blacklist.length === 0 ? "No relics are blacklisted from the shop pool." : `${relics.blacklist.length} relic${relics.blacklist.length === 1 ? " is" : "s are"} blacklisted from the shop pool: ${blacklist}.`}
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
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-gray-300">Common</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{potions.common.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{potions.common.min}–{potions.common.max}</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-blue-400">Uncommon</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{potions.uncommon.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{potions.uncommon.min}–{potions.uncommon.max}</td>
              </tr>
              <tr>
                <td className="p-3 text-[var(--accent-gold)]">Rare</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{potions.rare.base}</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">{potions.rare.min}–{potions.rare.max}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Range: base × random({potions.variance.min.toFixed(2)}–{potions.variance.max.toFixed(2)}). Same variance as cards.
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
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Ascension 0–{(inflation.level ?? 6) - 1}</h3>
            <div className="flex flex-wrap gap-2">
              {removalSchedule(card_removal.base, card_removal.increment).map((cost, i) => (
                <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center min-w-[80px]">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                  </div>
                  <div className="text-lg font-bold text-[var(--accent-gold)]">
                    {cost}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">gold</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Formula: {card_removal.base} + ({card_removal.increment} × removals used).
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              Ascension {inflation.level ?? 6}+ — <span className="text-[var(--accent-gold)]">{inflation.modifier}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {removalSchedule(inflation.base, inflation.increment).map((cost, i) => (
                <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center min-w-[80px]">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                  </div>
                  <div className="text-lg font-bold text-[var(--accent-gold)]">
                    {cost}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">gold</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Formula: {inflation.base} + ({inflation.increment} × removals used). Major Update #1 reworked Ascension {inflation.level ?? 6} from <span className="line-through">Gloom (less rest sites)</span> to {inflation.modifier}.
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
          The Fake Merchant is an event that sells {fake_merchant.relic_count} counterfeit relics for a flat {fake_merchant.flat_price} gold each. These are weaker versions of well-known relics. All fake relics have Event rarity.
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
                { fake: "Fake Anchor", real: "Anchor", price: fake_merchant.flat_price, effect: "Gain 4 Block at the start of combat (real: 10)" },
                { fake: "Fake Blood Vial", real: "Blood Vial", price: fake_merchant.flat_price, effect: "Heal 1 HP at the start of turn 1 only" },
                { fake: "Fake Happy Flower", real: "Happy Flower", price: fake_merchant.flat_price, effect: "Gain 1 Energy every 5 turns (real: every 3)" },
                { fake: "Fake Lee's Waffle", real: "Lee's Waffle", price: fake_merchant.flat_price, effect: "Heal 10% Max HP on pickup (real: raise Max HP)" },
                { fake: "Fake Mango", real: "Mango", price: fake_merchant.flat_price, effect: "Gain 3 Max HP on pickup (real: 14)" },
                { fake: "Fake Orichalcum", real: "Orichalcum", price: fake_merchant.flat_price, effect: "Gain 3 Block at end of turn if no Block (real: 6)" },
                { fake: "Fake Snecko Eye", real: "Snecko Eye", price: fake_merchant.flat_price, effect: "Applies Confused (randomizes card costs) with no draw bonus" },
                { fake: "Fake Strike Dummy", real: "Strike Dummy", price: fake_merchant.flat_price, effect: "Strike cards deal 1 extra damage (real: 3)" },
                { fake: "Fake Venerable Tea Set", real: "Venerable Tea Set", price: fake_merchant.flat_price, effect: "Gain 1 Energy next combat after resting (real: 2)" },
                { fake: "Fake Merchant's Rug", real: "—", price: fake_merchant.flat_price, effect: "No effect. Purely decorative." },
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
      <section>
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Technical Notes
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 text-sm text-[var(--text-secondary)] space-y-3">
          <p>
            All prices use the seeded <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops</code> random number generator, meaning prices are deterministic per seed.
          </p>
          <p>
            Cards use <code className="text-[var(--accent-gold)] text-xs">NextFloat({cards.variance.min.toFixed(2)}f, {cards.variance.max.toFixed(2)}f)</code> for a ±{cardVarPct}% variance. Relics use <code className="text-[var(--accent-gold)] text-xs">NextFloat({relics.variance.min.toFixed(2)}f, {relics.variance.max.toFixed(2)}f)</code> for a wider ±{relicVarPct}% variance. Potions use the same ±{cardVarPct}% as cards.
          </p>
          <p>
            The shop randomly picks one of the 5 character cards to put on sale ({Math.round((1 - cards.on_sale_fraction) * 100)}% off). The sale slot is determined by <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops.NextInt(5)</code>.
          </p>
          <p>
            When you buy an item, the slot is emptied. Items only restock if you have <strong>The Courier</strong> relic, which refills purchased slots with new random items (excluding duplicates already in the shop).
          </p>
        </div>
      </section>
    </div>
  );
}
