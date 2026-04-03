import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildDetailPageJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: `Slay the Spire 2 Game Mechanics | ${SITE_NAME}`,
  description:
    "Complete drop rate data and game mechanics for Slay the Spire 2. Card rarity odds, relic distribution, potion chances, gold rewards, map generation, combat formulas, and more — all extracted from the game's source code.",
  alternates: { canonical: `${SITE_URL}/mechanics` },
  openGraph: {
    title: `Slay the Spire 2 Game Mechanics | ${SITE_NAME}`,
    description: "Every drop rate, reward chance, and game formula extracted from the source code.",
    url: `${SITE_URL}/mechanics`,
    siteName: SITE_NAME,
    type: "website",
  },
};

const card = "bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5";
const h2 = "text-xl font-semibold text-[var(--accent-gold)] mb-4 mt-12 first:mt-0";
const h3 = "font-semibold text-[var(--text-primary)] mb-3";
const tbl = "w-full text-sm";
const thr = "border-b border-[var(--border-subtle)]";
const th = "text-left pb-2 text-[var(--text-muted)] font-semibold";
const thr2 = "text-right pb-2 text-[var(--text-muted)] font-semibold";
const tr = "border-b border-[var(--border-subtle)]/50";
const td = "py-2 text-[var(--text-secondary)]";
const tdr = "py-2 text-right text-[var(--text-primary)]";
const gold = "py-2 text-right text-[var(--accent-gold)]";
const note = "text-xs text-[var(--text-muted)] mt-3";
const bold = "text-[var(--text-primary)] font-semibold";

export default function DropRatesPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Mechanics", href: "/mechanics" },
    ]),
    ...buildDetailPageJsonLd({
      name: "Slay the Spire 2 Game Mechanics",
      description: "Complete drop rate data and game mechanics extracted from the source code.",
      path: "/mechanics",
      category: "Game Data",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Mechanics", href: "/mechanics" },
      ],
    }),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Game Mechanics</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-2">
        Every drop rate, reward chance, and game formula extracted from Slay the Spire 2&apos;s decompiled source code. All values are exact.
      </p>
      <nav className="text-xs text-[var(--text-muted)] mb-8 flex flex-wrap gap-x-3 gap-y-1">
        <a href="#cards" className="text-[var(--accent-gold)] hover:underline">Cards</a>
        <a href="#relics" className="text-[var(--accent-gold)] hover:underline">Relics</a>
        <a href="#potions" className="text-[var(--accent-gold)] hover:underline">Potions</a>
        <a href="#gold" className="text-[var(--accent-gold)] hover:underline">Gold</a>
        <a href="#shop" className="text-[var(--accent-gold)] hover:underline">Shop</a>
        <a href="#map" className="text-[var(--accent-gold)] hover:underline">Map</a>
        <a href="#unknown" className="text-[var(--accent-gold)] hover:underline">Unknown Rooms</a>
        <a href="#bosses" className="text-[var(--accent-gold)] hover:underline">Bosses</a>
        <a href="#combat" className="text-[var(--accent-gold)] hover:underline">Combat</a>
        <a href="#characters" className="text-[var(--accent-gold)] hover:underline">Characters</a>
        <a href="#orbs" className="text-[var(--accent-gold)] hover:underline">Orbs</a>
        <a href="#campfire" className="text-[var(--accent-gold)] hover:underline">Campfires</a>
        <a href="#neow" className="text-[var(--accent-gold)] hover:underline">Neow</a>
        <a href="#ascension" className="text-[var(--accent-gold)] hover:underline">Ascension</a>
      </nav>

      {/* ═══════════ CARD RARITY ═══════════ */}
      <h2 id="cards" className={h2}>Card Rarity Odds</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className={h3}>Normal Fights</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th><th className={thr2}>A7+</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Common</td><td className={tdr}>60%</td><td className={tdr}>61.5%</td></tr>
            <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>37%</td><td className={tdr}>37%</td></tr>
            <tr><td className={td}>Rare</td><td className={gold}>3%</td><td className={gold}>1.5%</td></tr>
          </tbody></table>
        </div>
        <div className={card}>
          <h3 className={h3}>Elite Fights</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th><th className={thr2}>A7+</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Common</td><td className={tdr}>50%</td><td className={tdr}>54.9%</td></tr>
            <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>40%</td><td className={tdr}>40%</td></tr>
            <tr><td className={td}>Rare</td><td className={gold}>10%</td><td className={gold}>5%</td></tr>
          </tbody></table>
        </div>
        <div className={card}>
          <h3 className={h3}>Boss Fights</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th></tr></thead><tbody>
            <tr><td className={td}>Rare</td><td className={gold}>100%</td></tr>
          </tbody></table>
          <p className={note}>Boss card rewards are always rare.</p>
        </div>
        <div className={card}>
          <h3 className={h3}>Shop</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th><th className={thr2}>A7+</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Common</td><td className={tdr}>54%</td><td className={tdr}>58.5%</td></tr>
            <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>37%</td><td className={tdr}>37%</td></tr>
            <tr><td className={td}>Rare</td><td className={gold}>9%</td><td className={gold}>4.5%</td></tr>
          </tbody></table>
        </div>
      </div>
      <div className={`${card} mt-4`}>
        <h3 className={h3}>Rare Card Pity System</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          A hidden offset starts at <strong className={bold}>-5%</strong> and increases by <strong className={bold}>+1%</strong> each time you pick a non-rare card (+0.5% on A7+). When a rare is rolled, the offset resets to -5%. Caps at <strong className={bold}>+40%</strong>. This ensures you see rares more often the longer you go without one.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className={card}>
          <h3 className={h3}>Card Upgrade Chance</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Card rewards have a <strong className={bold}>25%</strong> chance to be offered upgraded (<strong className={bold}>12.5%</strong> on A7+). Rare cards are never auto-upgraded.
          </p>
        </div>
        <div className={card}>
          <h3 className={h3}>Cards Offered</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            All combat encounters offer <strong className={bold}>3 cards</strong> to choose from (normal, elite, and boss).
          </p>
        </div>
      </div>

      {/* ═══════════ RELICS ═══════════ */}
      <h2 id="relics" className={h2}>Relic Rarity Distribution</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className={h3}>Rarity Roll</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Common</td><td className={tdr}>50%</td></tr>
            <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>33%</td></tr>
            <tr><td className={td}>Rare</td><td className={gold}>17%</td></tr>
          </tbody></table>
          <p className={note}>Used for elite rewards and treasure rooms. If a rarity pool is exhausted, it falls back to the next tier.</p>
        </div>
        <div className={card}>
          <h3 className={h3}>Sources</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Source</th><th className={thr2}>Relics</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Elite fight</td><td className={tdr}>1 (random rarity)</td></tr>
            <tr className={tr}><td className={td}>Treasure room</td><td className={tdr}>1 (random rarity)</td></tr>
            <tr className={tr}><td className={td}>Shop</td><td className={tdr}>3 (2 random + 1 shop)</td></tr>
            <tr><td className={td}>Boss fight</td><td className={tdr}>1 boss relic</td></tr>
          </tbody></table>
        </div>
      </div>

      {/* ═══════════ POTIONS ═══════════ */}
      <h2 id="potions" className={h2}>Potion Drop Rates</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className={h3}>Combat Rewards</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Encounter</th><th className={thr2}>Base Chance</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Normal</td><td className={tdr}>40%</td></tr>
            <tr><td className={td}>Elite</td><td className={tdr}>~52.5%</td></tr>
          </tbody></table>
          <p className={note}>
            <strong className="text-[var(--text-secondary)]">Pity system:</strong> +10% each fight without a potion, -10% when one drops. Caps at 50%. Elite fights add a flat 12.5% bonus without affecting the pity counter.
          </p>
        </div>
        <div className={card}>
          <h3 className={h3}>Rarity Distribution</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th></tr></thead><tbody>
            <tr className={tr}><td className="py-2 text-gray-300">Common</td><td className={tdr}>65%</td></tr>
            <tr className={tr}><td className="py-2 text-blue-400">Uncommon</td><td className={tdr}>25%</td></tr>
            <tr><td className="py-2 text-[var(--accent-gold)]">Rare</td><td className={tdr}>10%</td></tr>
          </tbody></table>
          <p className={note}>Default capacity: <strong className="text-[var(--text-secondary)]">3 slots</strong> (2 on A4+).</p>
        </div>
      </div>

      {/* ═══════════ GOLD ═══════════ */}
      <h2 id="gold" className={h2}>Gold Rewards</h2>
      <div className={card}>
        <table className={tbl}><thead><tr className={thr}><th className={th}>Source</th><th className={thr2}>Gold</th><th className={thr2}>A3+</th></tr></thead><tbody>
          <tr className={tr}><td className={td}>Normal fight</td><td className={gold}>10-20</td><td className={gold}>7-15</td></tr>
          <tr className={tr}><td className={td}>Elite fight</td><td className={gold}>35-45</td><td className={gold}>26-33</td></tr>
          <tr className={tr}><td className={td}>Boss fight</td><td className={gold}>100</td><td className={gold}>75</td></tr>
          <tr><td className={td}>Treasure room</td><td className={gold}>42-52</td><td className={gold}>31-39</td></tr>
        </tbody></table>
        <p className={note}>Ascension 3 (Poverty) multiplies all gold rewards by 0.75x. If enemies escape during combat, gold is proportionally reduced.</p>
      </div>

      {/* ═══════════ SHOP ═══════════ */}
      <h2 id="shop" className={h2}>Shop Inventory</h2>
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className={h3}>Inventory Layout</h3>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Category</th><th className={thr2}>Slots</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Character cards</td><td className={tdr}>5 (2 ATK, 2 SKL, 1 PWR)</td></tr>
              <tr className={tr}><td className={td}>Colorless cards</td><td className={tdr}>2 (1 UNC, 1 RARE)</td></tr>
              <tr className={tr}><td className={td}>Relics</td><td className={tdr}>3 (2 random + 1 shop)</td></tr>
              <tr className={tr}><td className={td}>Potions</td><td className={tdr}>3</td></tr>
              <tr><td className={td}>Card removal</td><td className={tdr}>1 service</td></tr>
            </tbody></table>
            <p className={note}>One random character card is &quot;On Sale&quot; each visit. All prices have &plusmn;15% variance.</p>
          </div>
          <div>
            <h3 className={h3}>Card Removal Cost</h3>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Removals Used</th><th className={thr2}>Cost</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>0 (first)</td><td className={gold}>75g</td></tr>
              <tr className={tr}><td className={td}>1</td><td className={gold}>100g</td></tr>
              <tr className={tr}><td className={td}>2</td><td className={gold}>125g</td></tr>
              <tr className={tr}><td className={td}>3</td><td className={gold}>150g</td></tr>
              <tr><td className={td}>n</td><td className={gold}>75 + 25n</td></tr>
            </tbody></table>
          </div>
        </div>
      </div>

      {/* ═══════════ MAP ═══════════ */}
      <h2 id="map" className={h2}>Map Generation</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className={h3}>Act Structure</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Act</th><th className={thr2}>Rooms</th><th className={thr2}>Weak Fights</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Overgrowth (Act 1)</td><td className={tdr}>17</td><td className={tdr}>3</td></tr>
            <tr className={tr}><td className={td}>Underdocks (Alt Act 1)</td><td className={tdr}>17</td><td className={tdr}>3</td></tr>
            <tr className={tr}><td className={td}>Hive (Act 2)</td><td className={tdr}>16</td><td className={tdr}>2</td></tr>
            <tr><td className={td}>Glory (Act 3)</td><td className={tdr}>15</td><td className={tdr}>2</td></tr>
          </tbody></table>
          <p className={note}>Map is a 7-column grid. First row is always fights, second-to-last is treasure, last is a rest site. Boss sits above.</p>
        </div>
        <div className={card}>
          <h3 className={h3}>Room Distribution</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Type</th><th className={thr2}>Count</th><th className={thr2}>A1+</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Elites</td><td className={tdr}>5</td><td className={gold}>8</td></tr>
            <tr className={tr}><td className={td}>Shops</td><td className={tdr}>3</td><td className={tdr}>3</td></tr>
            <tr className={tr}><td className={td}>Unknown (?)</td><td className={tdr}>10-14</td><td className={tdr}>10-14</td></tr>
            <tr className={tr}><td className={td}>Rest sites</td><td className={tdr}>3-7</td><td className={tdr}>-1 on A6</td></tr>
            <tr><td className={td}>Fights</td><td className={tdr} colSpan={2}>Remaining slots</td></tr>
          </tbody></table>
          <p className={note}>Unknown rooms average ~12 (Gaussian). Rest sites vary by act. No elites or rest sites in the first 5 rows.</p>
        </div>
      </div>

      {/* ═══════════ UNKNOWN ROOMS ═══════════ */}
      <h2 id="unknown" className={h2}>Unknown Room (&quot;?&quot;) Probabilities</h2>
      <div className={card}>
        <table className={tbl}><thead><tr className={thr}><th className={th}>Outcome</th><th className={thr2}>Base Chance</th><th className={thr2}>Adaptive</th></tr></thead><tbody>
          <tr className={tr}><td className={td}>Event</td><td className={gold}>~85%</td><td className={tdr}>Remainder after other rolls</td></tr>
          <tr className={tr}><td className={td}>Monster fight</td><td className={tdr}>10%</td><td className={tdr}>+10% each miss</td></tr>
          <tr className={tr}><td className={td}>Shop</td><td className={tdr}>3%</td><td className={tdr}>+3% each miss</td></tr>
          <tr className={tr}><td className={td}>Treasure</td><td className={tdr}>2%</td><td className={tdr}>+2% each miss</td></tr>
          <tr><td className={td}>Elite</td><td className={tdr}>0%</td><td className={tdr}>Accumulates from -1</td></tr>
        </tbody></table>
        <p className={note}>
          Each outcome has adaptive odds: when it doesn&apos;t occur, its chance increases by its base amount. When it does occur, it resets. On your very first run, the first 2 unknown rooms are always events, and the 3rd is always a fight.
        </p>
      </div>

      {/* ═══════════ BOSSES & ELITES ═══════════ */}
      <h2 id="bosses" className={h2}>Bosses &amp; Elites by Act</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className={h3}>Act 1: Overgrowth</h3>
          <p className="text-xs text-[var(--text-muted)] mb-2">Bosses (1 randomly selected)</p>
          <ul className="text-sm text-[var(--text-secondary)] mb-3 space-y-1">
            <li>Vantom</li>
            <li>Ceremonial Beast</li>
            <li>The Kin</li>
          </ul>
          <p className="text-xs text-[var(--text-muted)] mb-2">Elites</p>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1">
            <li>Bygone Effigy</li>
            <li>Byrdonis</li>
            <li>Phrog Parasite</li>
          </ul>
        </div>
        <div className={card}>
          <h3 className={h3}>Act 1: Underdocks (Alternate)</h3>
          <p className="text-xs text-[var(--text-muted)] mb-2">Bosses (1 randomly selected)</p>
          <ul className="text-sm text-[var(--text-secondary)] mb-3 space-y-1">
            <li>Waterfall Giant</li>
            <li>Soul Fysh</li>
            <li>Lagavulin Matriarch</li>
          </ul>
          <p className="text-xs text-[var(--text-muted)] mb-2">Elites</p>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1">
            <li>Skulking Colony</li>
            <li>Phantasmal Gardeners</li>
            <li>Terror Eel</li>
          </ul>
        </div>
        <div className={card}>
          <h3 className={h3}>Act 2: Hive</h3>
          <p className="text-xs text-[var(--text-muted)] mb-2">Bosses (1 randomly selected)</p>
          <ul className="text-sm text-[var(--text-secondary)] mb-3 space-y-1">
            <li>The Insatiable</li>
            <li>Knowledge Demon</li>
            <li>Kaiser Crab</li>
          </ul>
          <p className="text-xs text-[var(--text-muted)] mb-2">Elites</p>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1">
            <li>Decimillipede</li>
            <li>Entomancer</li>
            <li>Infested Prisms</li>
          </ul>
        </div>
        <div className={card}>
          <h3 className={h3}>Act 3: Glory</h3>
          <p className="text-xs text-[var(--text-muted)] mb-2">Bosses (1 randomly selected)</p>
          <ul className="text-sm text-[var(--text-secondary)] mb-3 space-y-1">
            <li>Queen</li>
            <li>Test Subject</li>
            <li>Doormaker</li>
          </ul>
          <p className="text-xs text-[var(--text-muted)] mb-2">Elites</p>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1">
            <li>Knights</li>
            <li>Mecha Knight</li>
            <li>Soul Nexus</li>
          </ul>
        </div>
      </div>
      <p className={`${note} mt-2`}>Underdocks replaces Overgrowth 50% of the time (once unlocked). On A10, two bosses are fought at the end of each act.</p>

      {/* ═══════════ COMBAT ═══════════ */}
      <h2 id="combat" className={h2}>Combat Mechanics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className={h3}>Hand &amp; Draw</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Mechanic</th><th className={thr2}>Value</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Cards drawn per turn</td><td className={gold}>5</td></tr>
            <tr className={tr}><td className={td}>Max hand size</td><td className={gold}>10</td></tr>
            <tr className={tr}><td className={td}>Base energy per turn</td><td className={gold}>3</td></tr>
            <tr><td className={td}>Block</td><td className={tdr}>Clears at start of turn</td></tr>
          </tbody></table>
          <p className={note}>On turn 1, Innate cards are moved to the top of the draw pile. When the draw pile is empty, the discard pile is shuffled in.</p>
        </div>
        <div className={card}>
          <h3 className={h3}>Damage &amp; Defense Modifiers</h3>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Effect</th><th className={thr2}>Modifier</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Strength</td><td className={tdr}>+N attack damage (additive)</td></tr>
            <tr className={tr}><td className={td}>Dexterity</td><td className={tdr}>+N card block (additive)</td></tr>
            <tr className={tr}><td className={td}>Vulnerable</td><td className={gold}>1.5x damage taken</td></tr>
            <tr className={tr}><td className={td}>Weak</td><td className={gold}>0.75x damage dealt</td></tr>
            <tr><td className={td}>Frail</td><td className={gold}>0.75x block from cards</td></tr>
          </tbody></table>
          <p className={note}>Strength and Dexterity are additive (applied before multipliers). Vulnerable, Weak, and Frail are multiplicative.</p>
        </div>
      </div>
      <div className={`${card} mt-4`}>
        <h3 className={h3}>End of Turn</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Ethereal cards in hand are <strong className={bold}>exhausted</strong>. Cards with <strong className={bold}>Retain</strong> stay in hand. All other cards are discarded. Block clears at the start of your next turn (unless prevented by Barricade, Calipers, etc.).
        </p>
      </div>

      {/* ═══════════ CHARACTERS ═══════════ */}
      <h2 id="characters" className={h2}>Character Starting Stats</h2>
      <div className={card}>
        <table className={tbl}><thead><tr className={thr}><th className={th}>Character</th><th className={thr2}>HP</th><th className={thr2}>Gold</th><th className={thr2}>Deck</th><th className={thr2}>Orb Slots</th></tr></thead><tbody>
          <tr className={tr}><td className={td}>Ironclad</td><td className={gold}>80</td><td className={tdr}>99</td><td className={tdr}>10</td><td className={tdr}>0</td></tr>
          <tr className={tr}><td className={td}>Silent</td><td className={gold}>70</td><td className={tdr}>99</td><td className={tdr}>12</td><td className={tdr}>0</td></tr>
          <tr className={tr}><td className={td}>Defect</td><td className={gold}>75</td><td className={tdr}>99</td><td className={tdr}>10</td><td className={tdr}>3</td></tr>
          <tr className={tr}><td className={td}>Necrobinder</td><td className={gold}>66</td><td className={tdr}>99</td><td className={tdr}>10</td><td className={tdr}>0</td></tr>
          <tr><td className={td}>Regent</td><td className={gold}>75</td><td className={tdr}>99</td><td className={tdr}>10</td><td className={tdr}>0</td></tr>
        </tbody></table>
        <p className={note}>All characters start with 3 energy and 3 potion slots.</p>
      </div>

      {/* ═══════════ ORBS ═══════════ */}
      <h2 id="orbs" className={h2}>Orb Mechanics (Defect)</h2>
      <div className={card}>
        <table className={tbl}><thead><tr className={thr}><th className={th}>Orb</th><th className={thr2}>Passive</th><th className={thr2}>Evoke</th></tr></thead><tbody>
          <tr className={tr}><td className={td}>Lightning</td><td className={tdr}>3 damage to random enemy</td><td className={gold}>8 damage to random enemy</td></tr>
          <tr className={tr}><td className={td}>Frost</td><td className={tdr}>2 block</td><td className={gold}>5 block</td></tr>
          <tr className={tr}><td className={td}>Dark</td><td className={tdr}>+6 to evoke value</td><td className={gold}>Accumulated damage to lowest HP</td></tr>
          <tr><td className={td}>Plasma</td><td className={tdr}>1 energy (start of turn)</td><td className={gold}>2 energy</td></tr>
        </tbody></table>
        <p className={note}>Starting slots: 3. Max capacity: 10. When full, channeling evokes the leftmost orb. Focus modifies passive and evoke values.</p>
      </div>

      {/* ═══════════ CAMPFIRE ═══════════ */}
      <h2 id="campfire" className={h2}>Campfire Options</h2>
      <div className={card}>
        <table className={tbl}><thead><tr className={thr}><th className={th}>Option</th><th className={thr2}>Effect</th></tr></thead><tbody>
          <tr className={tr}><td className={td}>Rest</td><td className={tdr}>Heal 30% of max HP</td></tr>
          <tr className={tr}><td className={td}>Smith</td><td className={tdr}>Upgrade 1 card</td></tr>
          <tr className={tr}><td className={td}>Dig</td><td className={tdr}>Obtain a random relic (requires Shovel)</td></tr>
          <tr><td className={td}>Lift</td><td className={tdr}>Gain 1 Strength (requires Girya, max 3)</td></tr>
        </tbody></table>
      </div>

      {/* ═══════════ NEOW ═══════════ */}
      <h2 id="neow" className={h2}>Neow (Starting Ancient)</h2>
      <div className={card}>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          Neow offers <strong className={bold}>3 relic choices</strong>: 2 random positive relics and 1 random curse relic. You must pick one.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className={`${h3} text-sm`}>Positive Pool (2 picked)</h3>
            <p className="text-xs text-[var(--text-secondary)]">Arcane Scroll, Booming Conch, Pomander, Golden Pearl, Lead Paperweight, New Leaf, Neow&apos;s Torment, Precise Scissors, Lost Coffer</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Plus one of: Nutritious Oyster / Stone Humidifier (50/50) and one of: Lava Rock / Small Capsule (50/50)</p>
          </div>
          <div>
            <h3 className={`${h3} text-sm`}>Curse Pool (1 picked)</h3>
            <p className="text-xs text-[var(--text-secondary)]">Cursed Pearl, Large Capsule, Leafy Poultice, Precarious Shears, Scroll Boxes, Silver Crucible</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Conflicting pairs are removed (e.g. Cursed Pearl excludes Golden Pearl).</p>
          </div>
        </div>
        <p className={note}>Before the event, you are healed to full HP. On A2+, heal is only 80% of missing HP.</p>
      </div>

      {/* ═══════════ ASCENSION ═══════════ */}
      <h2 id="ascension" className={h2}>Ascension Modifiers</h2>
      <div className={card}>
        <table className={tbl}><thead><tr className={thr}><th className={th}>Level</th><th className={th}>Name</th><th className={thr2}>Effect</th></tr></thead><tbody>
          <tr className={tr}><td className={td}>1</td><td className={td}>Swarming Elites</td><td className={tdr}>5 → 8 elites on map</td></tr>
          <tr className={tr}><td className={td}>2</td><td className={td}>Weary Traveler</td><td className={tdr}>Ancient heals only 80%</td></tr>
          <tr className={tr}><td className={td}>3</td><td className={td}>Poverty</td><td className={tdr}>Gold rewards x0.75</td></tr>
          <tr className={tr}><td className={td}>4</td><td className={td}>Tight Belt</td><td className={tdr}>3 → 2 potion slots</td></tr>
          <tr className={tr}><td className={td}>5</td><td className={td}>Ascender&apos;s Bane</td><td className={tdr}>Start with Ascender&apos;s Bane curse</td></tr>
          <tr className={tr}><td className={td}>6</td><td className={td}>Gloom</td><td className={tdr}>1 fewer rest site on map</td></tr>
          <tr className={tr}><td className={td}>7</td><td className={td}>Scarcity</td><td className={tdr}>~50% rarer cards, slower pity</td></tr>
          <tr className={tr}><td className={td}>8</td><td className={td}>Tough Enemies</td><td className={tdr}>Enemy HP increases (per-enemy)</td></tr>
          <tr className={tr}><td className={td}>9</td><td className={td}>Deadly Enemies</td><td className={tdr}>Enemy damage increases (per-enemy)</td></tr>
          <tr><td className={td}>10</td><td className={td}>Double Boss</td><td className={tdr}>Two bosses at end of each act</td></tr>
        </tbody></table>
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center mt-8 mb-4">
        All values extracted from decompiled C# source &mdash; CardRarityOdds.cs, PotionRewardOdds.cs, RelicFactory.cs, MerchantInventory.cs, StandardActMap.cs, UnknownMapPointOdds.cs, AscensionLevel.cs, and more.
      </p>
    </div>
  );
}
