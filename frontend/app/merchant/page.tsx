import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

export default function MerchantPage() {
  const jsonLd = [
    ...buildDetailPageJsonLd({
      name: "Merchant Guide",
      description: "Complete Slay the Spire 2 merchant price guide with card, relic, and potion costs, card removal pricing, and Fake Merchant relic details.",
      path: "/merchant",
      category: "Guide",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Merchant Guide", href: "/merchant" },
      ],
    }),
    buildFAQPageJsonLd([
      { question: "How much do cards cost at the merchant in Slay the Spire 2?", answer: "Common cards cost 48-53 gold, Uncommon 71-79 gold, Rare 143-158 gold. Colorless cards have a 15% markup. One random card is on sale for half price." },
      { question: "How much do relics cost at the shop in Slay the Spire 2?", answer: "Common relics cost 170-230 gold, Uncommon 213-288 gold, Rare 255-345 gold, and Shop relics 191-259 gold." },
      { question: "How much does card removal cost in Slay the Spire 2?", answer: "Card removal starts at 75 gold and increases by 25 gold each time you use it (75, 100, 125, 150, etc.)." },
      { question: "What is the Fake Merchant in Slay the Spire 2?", answer: "The Fake Merchant is an event that sells counterfeit versions of popular relics for only 50 gold each. These fakes have weaker effects than the originals." },
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
              <p className="text-[var(--text-muted)]">1 Uncommon, 1 Rare — from the colorless pool. 15% price markup.</p>
            </div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Relics (3)</h3>
              <p className="text-[var(--text-muted)]">2 random rarity rolls + 1 guaranteed Shop relic. The Courier and Old Coin are blacklisted.</p>
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
                <td className="p-3 text-right text-[var(--text-primary)]">50</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">48–53</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">55–60</td>
                <td className="p-3 text-right text-emerald-400">24–27</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-blue-400">Uncommon</td>
                <td className="p-3 text-right text-[var(--text-primary)]">75</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">71–79</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">82–90</td>
                <td className="p-3 text-right text-emerald-400">36–40</td>
              </tr>
              <tr>
                <td className="p-3 text-[var(--accent-gold)]">Rare</td>
                <td className="p-3 text-right text-[var(--text-primary)]">150</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">143–158</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">164–181</td>
                <td className="p-3 text-right text-emerald-400">71–79</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Range: base × random(0.95–1.05). Colorless: +15% markup. On sale: 50% off.
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
                <td className="p-3 text-right text-[var(--text-primary)]">200</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">170–230</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×0.85–1.15</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-emerald-400">Shop</td>
                <td className="p-3 text-right text-[var(--text-primary)]">225</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">191–259</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×0.85–1.15</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-blue-400">Uncommon</td>
                <td className="p-3 text-right text-[var(--text-primary)]">250</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">213–288</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×0.85–1.15</td>
              </tr>
              <tr>
                <td className="p-3 text-[var(--accent-gold)]">Rare</td>
                <td className="p-3 text-right text-[var(--text-primary)]">300</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">255–345</td>
                <td className="p-3 text-right text-[var(--text-muted)]">×0.85–1.15</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Relics have a wider price variance (±15%) than cards (±5%). The Courier and Old Coin cannot appear in the shop.
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
                <td className="p-3 text-right text-[var(--text-primary)]">50</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">48–53</td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)]/50">
                <td className="p-3 text-blue-400">Uncommon</td>
                <td className="p-3 text-right text-[var(--text-primary)]">75</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">71–79</td>
              </tr>
              <tr>
                <td className="p-3 text-[var(--accent-gold)]">Rare</td>
                <td className="p-3 text-right text-[var(--text-primary)]">100</td>
                <td className="p-3 text-right text-[var(--accent-gold)]">95–105</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]/50">
            Range: base × random(0.95–1.05). Same variance as cards.
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
            The merchant offers card removal at an escalating price. The cost increases by 25 gold each time you use it during the run.
          </p>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center min-w-[80px]">
                <div className="text-xs text-[var(--text-muted)] mb-1">
                  {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                </div>
                <div className="text-lg font-bold text-[var(--accent-gold)]">
                  {75 + 25 * i}
                </div>
                <div className="text-xs text-[var(--text-muted)]">gold</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">
            Formula: 75 + (25 × removals used). No random variance.
          </p>
        </div>
      </section>

      {/* Fake Merchant */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Fake Merchant
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          The Fake Merchant is an event that sells counterfeit relics for a flat 50 gold each. These are weaker versions of well-known relics. All fake relics have Event rarity.
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
                { fake: "Fake Anchor", real: "Anchor", price: 50, effect: "Gain 4 Block at the start of combat (real: 10)" },
                { fake: "Fake Blood Vial", real: "Blood Vial", price: 50, effect: "Heal 1 HP at the start of turn 1 only" },
                { fake: "Fake Happy Flower", real: "Happy Flower", price: 50, effect: "Gain 1 Energy every 5 turns (real: every 3)" },
                { fake: "Fake Lee's Waffle", real: "Lee's Waffle", price: 50, effect: "Heal 10% Max HP on pickup (real: raise Max HP)" },
                { fake: "Fake Mango", real: "Mango", price: 50, effect: "Gain 3 Max HP on pickup (real: 14)" },
                { fake: "Fake Orichalcum", real: "Orichalcum", price: 50, effect: "Gain 3 Block at end of turn if no Block (real: 6)" },
                { fake: "Fake Snecko Eye", real: "Snecko Eye", price: 50, effect: "Applies Confused (randomizes card costs) with no draw bonus" },
                { fake: "Fake Strike Dummy", real: "Strike Dummy", price: 50, effect: "Strike cards deal 1 extra damage (real: 3)" },
                { fake: "Fake Venerable Tea Set", real: "Venerable Tea Set", price: 50, effect: "Gain 1 Energy next combat after resting (real: 2)" },
                { fake: "Fake Merchant's Rug", real: "—", price: 50, effect: "No effect. Purely decorative." },
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
            Cards use <code className="text-[var(--accent-gold)] text-xs">NextFloat(0.95f, 1.05f)</code> for a ±5% variance. Relics use <code className="text-[var(--accent-gold)] text-xs">NextFloat(0.85f, 1.15f)</code> for a wider ±15% variance. Potions use the same ±5% as cards.
          </p>
          <p>
            The shop randomly picks one of the 5 character cards to put on sale (50% off). The sale slot is determined by <code className="text-[var(--accent-gold)] text-xs">PlayerRng.Shops.NextInt(5)</code>.
          </p>
          <p>
            When you buy an item, the slot is emptied. Items only restock if you have <strong>The Courier</strong> relic, which refills purchased slots with new random items (excluding duplicates already in the shop).
          </p>
        </div>
      </section>
    </div>
  );
}
