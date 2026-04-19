import { card, h3, tbl, thr, th, thr2, tr, td, tdr, gold, note, bold } from "../styles";

export default function MechanicContent({ slug }: { slug: string }) {
  switch (slug) {
    case "card-rarity":
      return (
        <>
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
              A hidden offset starts at <strong className={bold}>-5%</strong> and increases by <strong className={bold}>+1%</strong> for each non-rare card <em>shown</em> in a combat reward (+0.5% on A7+) — including ones you skip. When a rare is rolled, the offset resets to -5%. Caps at <strong className={bold}>+40%</strong>. Each combat reward generates 3 cards up front, so a skipped reward still ticks the counter 3 times. This ensures you see rares more often the longer you go without one.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className={card}>
              <h3 className={h3}>Card Upgrade Chance</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Scales per act: <strong className={bold}>0%</strong> in Act 1, <strong className={bold}>25%</strong> in Act 2, <strong className={bold}>50%</strong> in Act 3 (halved on A7+: 0%/12.5%/25%). Rare cards are never auto-upgraded.
              </p>
            </div>
            <div className={card}>
              <h3 className={h3}>Cards Offered</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                All combat encounters offer <strong className={bold}>3 cards</strong> to choose from (normal, elite, and boss).
              </p>
            </div>
          </div>
        </>
      );

    case "relic-distribution":
      return (
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
      );

    case "potion-drop-rates":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={card}>
            <h3 className={h3}>Combat Rewards</h3>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Encounter</th><th className={thr2}>Base Chance</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Normal</td><td className={tdr}>40%</td></tr>
              <tr><td className={td}>Elite</td><td className={tdr}>~52.5%</td></tr>
            </tbody></table>
            <p className={note}>
              <strong className="text-[var(--text-secondary)]">Pity system:</strong> +10% each fight without a potion, -10% when one drops. No hard cap in the code. Elite fights add a flat 12.5% bonus without affecting the pity counter.
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
      );

    case "gold-rewards":
      return (
        <div className={card}>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Source</th><th className={thr2}>Gold</th><th className={thr2}>A3+</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Normal fight</td><td className={gold}>10-20</td><td className={gold}>7-15</td></tr>
            <tr className={tr}><td className={td}>Elite fight</td><td className={gold}>35-45</td><td className={gold}>26-33</td></tr>
            <tr className={tr}><td className={td}>Boss fight</td><td className={gold}>100</td><td className={gold}>75</td></tr>
            <tr><td className={td}>Treasure room</td><td className={gold}>42-52</td><td className={gold}>31-39</td></tr>
          </tbody></table>
          <p className={note}>Ascension 3 (Poverty) multiplies all gold rewards by 0.75x. If enemies escape during combat, gold is proportionally reduced.</p>
        </div>
      );

    case "shop-inventory":
      return (
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
              <p className={note}>One random character card is &quot;On Sale&quot; each visit. Card and potion prices have &plusmn;5% variance, relic prices have &plusmn;15% variance.</p>
            </div>
            <div>
              <h3 className={h3}>Card Removal Cost</h3>
              <table className={tbl}><thead><tr className={thr}><th className={th}>Removals Used</th><th className={thr2}>A0–5</th><th className={thr2}>A6+ (Inflation)</th></tr></thead><tbody>
                <tr className={tr}><td className={td}>0 (first)</td><td className={gold}>75g</td><td className={gold}>100g</td></tr>
                <tr className={tr}><td className={td}>1</td><td className={gold}>100g</td><td className={gold}>150g</td></tr>
                <tr className={tr}><td className={td}>2</td><td className={gold}>125g</td><td className={gold}>200g</td></tr>
                <tr className={tr}><td className={td}>3</td><td className={gold}>150g</td><td className={gold}>250g</td></tr>
                <tr><td className={td}>n</td><td className={gold}>75 + 25n</td><td className={gold}>100 + 50n</td></tr>
              </tbody></table>
              <p className={note}>Major Update #1 (v0.103.2) reworked Ascension 6 from Gloom (1 fewer rest site) into Inflation, which raises the base removal price by 25 gold and the per-use increment by 25.</p>
            </div>
          </div>
        </div>
      );

    case "map-generation":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={card}>
            <h3 className={h3}>Act Structure</h3>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Act</th><th className={thr2}>Rooms</th><th className={thr2}>Floors</th><th className={thr2}>Weak Fights</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Overgrowth (Act 1)</td><td className={tdr}>15</td><td className={tdr}>17</td><td className={tdr}>3</td></tr>
              <tr className={tr}><td className={td}>Underdocks (Alt Act 1)</td><td className={tdr}>15</td><td className={tdr}>17</td><td className={tdr}>3</td></tr>
              <tr className={tr}><td className={td}>Hive (Act 2)</td><td className={tdr}>14</td><td className={tdr}>16</td><td className={tdr}>2</td></tr>
              <tr><td className={td}>Glory (Act 3)</td><td className={tdr}>13</td><td className={tdr}>15</td><td className={tdr}>2</td></tr>
            </tbody></table>
            <p className={note}>Map is a 7-column grid. Rooms = choosable nodes, Floors = rooms + Ancient + boss. First row is always fights, 7 rows from the end is a guaranteed treasure room (or elite if replaced), last row is always a rest site.</p>
          </div>
          <div className={card}>
            <h3 className={h3}>Room Distribution</h3>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Type</th><th className={thr2}>Count</th><th className={thr2}>A1+</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Elites</td><td className={tdr}>5</td><td className={gold}>8</td></tr>
              <tr className={tr}><td className={td}>Shops</td><td className={tdr}>3</td><td className={tdr}>3</td></tr>
              <tr className={tr}><td className={td}>Unknown (?)</td><td className={tdr}>10-14</td><td className={tdr}>10-14</td></tr>
              <tr className={tr}><td className={td}>Rest sites</td><td className={tdr}>5-7 (varies by act)</td><td className={tdr}>-1 on A6</td></tr>
              <tr><td className={td}>Fights</td><td className={tdr} colSpan={2}>Remaining slots</td></tr>
            </tbody></table>
            <p className={note}>Unknown rooms average ~12 (Gaussian). Rest sites: 6-7 in Acts 1-2, 5-6 in Act 3 (each -1 on A6). No elites or rest sites in the first 5 rows.</p>
          </div>
        </div>
      );

    case "unknown-rooms":
      return (
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
      );

    case "bosses-and-elites":
      return (
        <>
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
          <p className={`${note} mt-2`}>Underdocks replaces Overgrowth 50% of the time (once unlocked). On A10, two bosses are fought at the end of the final act.</p>
        </>
      );

    case "combat-mechanics":
      return (
        <>
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
        </>
      );

    case "character-stats":
      return (
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
      );

    case "orb-mechanics":
      return (
        <div className={card}>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Orb</th><th className={thr2}>Passive</th><th className={thr2}>Evoke</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Lightning</td><td className={tdr}>3 damage to random enemy</td><td className={gold}>8 damage to random enemy</td></tr>
            <tr className={tr}><td className={td}>Frost</td><td className={tdr}>2 block</td><td className={gold}>5 block</td></tr>
            <tr className={tr}><td className={td}>Dark</td><td className={tdr}>+6 to evoke value</td><td className={gold}>Accumulated damage to lowest HP</td></tr>
            <tr className={tr}><td className={td}>Plasma</td><td className={tdr}>1 energy (start of turn)</td><td className={gold}>2 energy</td></tr>
            <tr><td className={td}>Glass</td><td className={tdr}>4 damage to all enemies (-1/turn)</td><td className={gold}>Passive value x2 to all enemies</td></tr>
          </tbody></table>
          <p className={note}>Starting slots: 3. Max capacity: 10. When full, channeling evokes the leftmost orb. Focus modifies passive and evoke values.</p>
        </div>
      );

    case "campfire-options":
      return (
        <div className={card}>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Option</th><th className={thr2}>Effect</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Rest</td><td className={tdr}>Heal 30% of max HP</td></tr>
            <tr className={tr}><td className={td}>Smith</td><td className={tdr}>Upgrade 1 card</td></tr>
            <tr className={tr}><td className={td}>Dig</td><td className={tdr}>Obtain a random relic (requires Shovel)</td></tr>
            <tr className={tr}><td className={td}>Lift</td><td className={tdr}>Gain 1 Strength (requires Girya, max 3)</td></tr>
            <tr className={tr}><td className={td}>Cook</td><td className={tdr}>Remove 2 cards, gain 9 Max HP (requires Meal Kit)</td></tr>
            <tr className={tr}><td className={td}>Clone</td><td className={tdr}>Enchant a card with Clone (requires Pael&apos;s Growth)</td></tr>
            <tr className={tr}><td className={td}>Hatch</td><td className={tdr}>Hatch Byrdonis Egg into Byrdpip pet (requires Byrdonis Egg)</td></tr>
            <tr><td className={td}>Mend</td><td className={tdr}>Heal an ally for 30% of their max HP (multiplayer only)</td></tr>
          </tbody></table>
        </div>
      );

    case "neow":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Neow offers <strong className={bold}>3 relic choices</strong>: 2 random positive relics and 1 random curse relic. You must pick one.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className={`${h3} text-sm`}>Positive Pool (2 picked)</h3>
              <p className="text-xs text-[var(--text-secondary)]">Arcane Scroll, Booming Conch, Golden Pearl, Lead Paperweight, Lost Coffer, Massive Scroll, Neow&apos;s Torment, New Leaf, Phial Holster, Precise Scissors, Winged Boots</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Plus one of each pair (50/50 each): Lava Rock / Small Capsule · Nutritious Oyster / Stone Humidifier · Neow&apos;s Talisman / Pomander</p>
            </div>
            <div>
              <h3 className={`${h3} text-sm`}>Curse Pool (1 picked)</h3>
              <p className="text-xs text-[var(--text-secondary)]">Cursed Pearl, Hefty Tablet, Large Capsule, Leafy Poultice, Neow&apos;s Bones, Precarious Shears, Scroll Boxes (conditional), Silver Crucible (singleplayer only)</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Conflicting pairs are removed (e.g. Cursed Pearl excludes Golden Pearl, Hefty Tablet excludes Arcane Scroll, Leafy Poultice excludes New Leaf, Precarious Shears excludes Precise Scissors). If Large Capsule rolls as the curse, both the Lava Rock / Small Capsule pair are skipped.</p>
            </div>
          </div>
          <p className={note}>Before the event, you are healed to full HP. On A2+, heal is only 80% of missing HP. Major Update #1 (v0.103.2) expanded both pools — Phial Holster, Winged Boots, Massive Scroll, and Neow&apos;s Talisman joined the positive side; Hefty Tablet and Neow&apos;s Bones joined the curse side.</p>
        </div>
      );

    case "ascension-modifiers":
      return (
        <div className={card}>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Level</th><th className={th}>Name</th><th className={thr2}>Effect</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>1</td><td className={td}>Swarming Elites</td><td className={tdr}>5 → 8 elites on map</td></tr>
            <tr className={tr}><td className={td}>2</td><td className={td}>Weary Traveler</td><td className={tdr}>Ancient heals only 80%</td></tr>
            <tr className={tr}><td className={td}>3</td><td className={td}>Poverty</td><td className={tdr}>Gold rewards x0.75</td></tr>
            <tr className={tr}><td className={td}>4</td><td className={td}>Tight Belt</td><td className={tdr}>3 → 2 potion slots</td></tr>
            <tr className={tr}><td className={td}>5</td><td className={td}>Ascender&apos;s Bane</td><td className={tdr}>Start with Ascender&apos;s Bane curse</td></tr>
            <tr className={tr}><td className={td}>6</td><td className={td}>Inflation</td><td className={tdr}>Card removal at the Merchant is more expensive (base 100g, +50g per use)</td></tr>
            <tr className={tr}><td className={td}>7</td><td className={td}>Scarcity</td><td className={tdr}>~50% rarer cards, slower pity</td></tr>
            <tr className={tr}><td className={td}>8</td><td className={td}>Tough Enemies</td><td className={tdr}>Enemy HP increases (per-enemy)</td></tr>
            <tr className={tr}><td className={td}>9</td><td className={td}>Deadly Enemies</td><td className={tdr}>Enemy damage increases (per-enemy)</td></tr>
            <tr><td className={td}>10</td><td className={td}>Double Boss</td><td className={tdr}>Two bosses at end of the final act</td></tr>
          </tbody></table>
        </div>
      );

    case "score-formula":
      return (
        <div className={card}>
          <table className={tbl}><thead><tr className={thr}><th className={th}>Component</th><th className={thr2}>Value</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Rooms visited</td><td className={tdr}>10 pts per room per act (x1/x2/x3)</td></tr>
            <tr className={tr}><td className={td}>Gold gained</td><td className={tdr}>+1 pt per 100 gold (divided by player count)</td></tr>
            <tr className={tr}><td className={td}>Elites killed</td><td className={gold}>+50 each (the elite you died to doesn&apos;t count)</td></tr>
            <tr className={tr}><td className={td}>Bosses slain</td><td className={gold}>+100 each (3 on a win, fewer if you die earlier; A10 wins count 4)</td></tr>
            <tr><td className={td}>Ascension multiplier</td><td className={gold}>x(1 + ascension x 0.1)</td></tr>
          </tbody></table>
          <p className={note}>Total = (rooms + gold + elites + bosses) x (1 + ascension x 0.1). At Ascension 10, your score is doubled. Daily-run scoring also encodes badge count and run time on top of this base. The final boss scene uses your score to determine the visual damage numbers.</p>
        </div>
      );

    case "foul-potion":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The Foul Potion is the most context-sensitive item in the game. <strong className={bold}>In combat</strong>, it deals 12 damage to all enemies. <strong className={bold}>At a real merchant</strong>, throw it at the shopkeeper to receive 100 gold (with a slime impact VFX). <strong className={bold}>At the Fake Merchant</strong>, throwing it reveals the impostor and triggers a boss fight against the Fake Merchant Monster (165-175 HP). Beat it to earn the Fake Merchant&apos;s Rug relic and all unpurchased fake relics.
          </p>
        </div>
      );

    case "wongo-loyalty":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The Welcome to Wongo&apos;s event (Act 2) has a hidden cross-run loyalty system. Each purchase earns Wongo Points that accumulate across ALL runs. At <strong className={bold}>2,000 points</strong>, you earn a Wongo Customer Appreciation Badge relic. But beware: <strong className={bold}>leaving without buying anything downgrades a random upgraded card</strong> in your deck.
          </p>
          <table className={`${tbl} mt-3`}><thead><tr className={thr}><th className={th}>Purchase</th><th className={thr2}>Cost</th><th className={thr2}>Points</th></tr></thead><tbody>
            <tr className={tr}><td className={td}>Bargain Bin (Common relic)</td><td className={tdr}>100g</td><td className={gold}>32 pts</td></tr>
            <tr className={tr}><td className={td}>Featured Item (Rare relic)</td><td className={tdr}>200g</td><td className={gold}>16 pts</td></tr>
            <tr><td className={td}>Mystery Box (3 relics after 5 fights)</td><td className={tdr}>300g</td><td className={gold}>8 pts</td></tr>
          </tbody></table>
        </div>
      );

    case "crystal-sphere":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The Crystal Sphere event isn&apos;t just a simple choice &mdash; it&apos;s a hidden-object game on an <strong className={bold}>11x11 grid</strong>. You get 3 divinations (or 6 if you take on Debt curses), each revealing cells using a &quot;Big&quot; (3x3) or &quot;Small&quot; (single cell) tool. The grid contains a relic, 3 potions, 3 card rewards of increasing rarity, gold piles (10g and 30g), and a hidden Doubt curse occupying a 2x2 area.
          </p>
        </div>
      );

    case "reflections":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The Reflections event (Act 3) offers a &quot;Shatter&quot; option that <strong className={bold}>clones every card in your deck 1:1</strong>, doubling its size. The catch: you also receive a Bad Luck curse. The safer &quot;Touch a Mirror&quot; option downgrades 2 random upgraded cards but upgrades 4 random upgradable ones.
          </p>
        </div>
      );

    case "the-architect":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The final encounter with The Architect has <strong className={bold}>9,999 HP</strong> but its only move is &quot;NOTHING&quot; with a hidden intent. The ending is a dialogue scene, not a fight. Each character has unique conversations that change based on how many times you&apos;ve visited. Your run score determines the visual damage numbers in the finale &mdash; one hit is intentionally made 2-3x larger for dramatic effect.
          </p>
        </div>
      );

    case "orobas-prismatic":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            When visiting the Ancient Orobas in Act 2, there&apos;s a <strong className={bold}>33% chance</strong> the Prismatic Gem is added to Orobas&apos;s first relic pool (alongside Electric Shrymp, Glass Eye, and Sand Castle). If it doesn&apos;t appear, Sea Glass (from another character&apos;s pool) takes its slot instead. Since one relic is randomly picked from the pool of 4, the actual chance of being <em>offered</em> Prismatic Gem is <strong className={bold}>~8.3%</strong> (33% &times; 25%). This relic makes card rewards include cards from ALL character pools. Orobas also offers starter relic upgrades: Burning Blood becomes Black Blood, Ring of the Snake becomes Ring of the Drake, and so on.
          </p>
        </div>
      );

    case "byrdpip":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Hatch a Byrdonis Egg at a rest site to get the Byrdpip relic, which spawns a pet in every combat. Byrdpip has <strong className={bold}>9,999 HP</strong>, a hidden health bar, and its only move is literally called <code className="bg-[var(--bg-primary)] px-1 rounded text-xs text-[var(--accent-gold)]">NOTHING_MOVE</code>. It has 4 random skin variants and converts all egg cards into Byrd Swoop (0-cost, 14 damage). Only one pet per player.
          </p>
        </div>
      );

    case "merchant-blacklist":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Five relics override <code className="bg-[var(--bg-primary)] px-1 rounded text-xs text-[var(--accent-gold)]">IsAllowedInShops =&gt; false</code> and never appear in the merchant pool: <strong className={bold}>The Courier</strong>, <strong className={bold}>Old Coin</strong>, <strong className={bold}>Lucky Fysh</strong>, <strong className={bold}>Bowler Hat</strong>, and <strong className={bold}>Amethyst Aubergine</strong>. Major Update #1 (v0.103.2) added the last three after gold-generating relics broke shop economy testing — they remain craftable through other sources but are walled off from the merchant.
          </p>
        </div>
      );

    case "autoslay":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            AutoSlay is a full automated player used for CI testing. It picks a random character, plays through up to floor 49 with a 25-minute timeout, handles every room type, always rests at campfires, and reports results to Sentry. It runs in &quot;Fast Mode&quot; with tutorials disabled.
          </p>
        </div>
      );

    case "dev-console":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The developer console has 39 commands including <code className="bg-[var(--bg-primary)] px-1 rounded text-xs text-[var(--accent-gold)]">godmode</code> (9,999 Strength + Buffer + Regen), <code className="bg-[var(--bg-primary)] px-1 rounded text-xs text-[var(--accent-gold)]">die</code> (instant death), <code className="bg-[var(--bg-primary)] px-1 rounded text-xs text-[var(--accent-gold)]">win</code> (kill all enemies), and <code className="bg-[var(--bg-primary)] px-1 rounded text-xs text-[var(--accent-gold)]">trailer</code> (toggle UI for capturing footage). The test dummy monster uses the Defect&apos;s sprite.
          </p>
        </div>
      );

    case "the-deprived":
      return (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            A debug-only character called &quot;The Deprived&quot; exists in the code with <strong className={bold}>1,000 HP</strong>, <strong className={bold}>100 energy</strong> per turn, an empty starting deck, no relics, and neutral gender. It uses a purple color scheme and has zero animation delays. Not accessible through normal play.
          </p>
        </div>
      );

    default:
      return null;
  }
}
