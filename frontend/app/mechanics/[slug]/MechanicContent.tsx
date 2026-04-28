import { card, h3, tbl, thr, th, thr2, tr, td, tdr, gold, note, bold } from "../styles";

// Optional character-stats data sourced from `/api/characters` and
// passed in by the page wrapper. When present we render the table from
// it instead of the hardcoded fallback below — avoids the silent drift
// (e.g. Necrobinder HP changing in a patch and the page never updating).
export interface CharacterStatsRow {
  id: string;
  name: string;
  starting_hp: number;
  starting_gold: number;
  deck_size: number;
  orb_slots: number;
}

// Subset of `data/mechanics_constants.json` consumed by the
// card-rarity page. Only the buckets we actually render are typed
// here so the prop stays narrow — page wrapper picks them off the
// full payload before passing.
type AscensionConditional = {
  base: number;
  ascended: number;
  ascension_level: string;
};
export interface CardRarityConstants {
  bossCommonOdds: number;
  bossUncommonOdds: number;
  bossRareOdds: number;
  eliteUncommonOdds: number;
  regularUncommonOdds: number;
  shopUncommonOdds: number;
  _baseRarityOffset: number;
  _maxRarityOffset: number;
  RegularRareOdds?: AscensionConditional;
  EliteCommonOdds?: AscensionConditional;
  EliteRareOdds?: AscensionConditional;
  ShopCommonOdds?: AscensionConditional;
  ShopRareOdds?: AscensionConditional;
  RarityGrowth?: AscensionConditional;
  regularCommonOdds?: AscensionConditional | number;
}

// Encounter gold ranges per room type, sourced from
// `EncounterModel.cs::MinGoldReward / MaxGoldReward` switches.
export interface EncounterGoldConstants {
  Monster?: { min: number; max: number };
  Elite?: { min: number; max: number };
  Boss?: { min: number; max: number };
}

// Multiplier applied to all encounter gold rewards once the player
// reaches Ascension 3 (Poverty), pulled from
// `AscensionHelper.PovertyAscensionGoldMultiplier`.
export interface AscensionHelperConstants {
  PovertyAscensionGoldMultiplier?: number;
}

// Damage / block multipliers from the named combat-debuff powers.
// Each entry's `value` is the literal from the power's `CanonicalVars`
// — Vulnerable's `DamageIncrease` (1.5x), Weak's `DamageDecrease`
// (0.75x), Frail's `BlockDecrease` (0.75x). Lets the combat-mechanics
// page stay in sync with C# balance changes without a code edit.
export interface CombatModifierEntry {
  key: string;
  value: number;
}
export interface CombatModifiers {
  Vulnerable?: CombatModifierEntry;
  Weak?: CombatModifierEntry;
  Frail?: CombatModifierEntry;
}

interface MechanicContentProps {
  slug: string;
  characterStats?: CharacterStatsRow[];
  cardRarity?: CardRarityConstants;
  encounterGold?: EncounterGoldConstants;
  ascensionHelper?: AscensionHelperConstants;
  ascensionLevels?: string[];
  combatModifiers?: CombatModifiers;
}

// Format a probability (0..1) as a percentage string. Trims trailing
// zeros so 0.5 renders as "50%" not "50.0%".
function pct(value: number): string {
  const v = value * 100;
  return Number.isInteger(v) ? `${v}%` : `${parseFloat(v.toFixed(2))}%`;
}

// Helper: pull the base value out of a const-or-AscensionConditional
// field. Card-rarity has both shapes (e.g. `regularUncommonOdds: 0.37`
// vs `regularCommonOdds: { base: 0.6, ascended: 0.615, ... }`).
function baseValue(field: number | AscensionConditional | undefined, fallback: number): number {
  if (field === undefined) return fallback;
  if (typeof field === "number") return field;
  return field.base;
}
function ascendedValue(field: AscensionConditional | undefined, fallback: number): number {
  return field?.ascended ?? fallback;
}

// Render a multiplier as a short label like "1.5x" / "0.75x" — trims
// trailing zeros so 1.5 reads "1.5x" not "1.50x".
function mult(value: number): string {
  return `${parseFloat(value.toFixed(2))}x`;
}

export default function MechanicContent({
  slug,
  characterStats,
  cardRarity,
  encounterGold,
  ascensionHelper,
  ascensionLevels,
  combatModifiers,
}: MechanicContentProps) {
  switch (slug) {
    case "card-rarity": {
      // Per-table values pulled from the parsed C# constants when
      // available, hardcoded fallbacks otherwise. Fallbacks mirror
      // CardRarityOdds.cs as of Mega Crit's 2026-04 build — kept in
      // sync by `parse_all.py` running before each release.
      const r = cardRarity;
      const normalCommon = baseValue(r?.regularCommonOdds, 0.6);
      const normalCommonAsc = ascendedValue(typeof r?.regularCommonOdds === "object" ? r?.regularCommonOdds : undefined, 0.615);
      const normalUncommon = r?.regularUncommonOdds ?? 0.37;
      const normalRare = baseValue(r?.RegularRareOdds, 0.03);
      const normalRareAsc = ascendedValue(r?.RegularRareOdds, 0.0149);
      const eliteCommon = baseValue(r?.EliteCommonOdds, 0.5);
      const eliteCommonAsc = ascendedValue(r?.EliteCommonOdds, 0.549);
      const eliteUncommon = r?.eliteUncommonOdds ?? 0.4;
      const eliteRare = baseValue(r?.EliteRareOdds, 0.1);
      const eliteRareAsc = ascendedValue(r?.EliteRareOdds, 0.05);
      const bossRare = r?.bossRareOdds ?? 1.0;
      const shopCommon = baseValue(r?.ShopCommonOdds, 0.54);
      const shopCommonAsc = ascendedValue(r?.ShopCommonOdds, 0.585);
      const shopUncommon = r?.shopUncommonOdds ?? 0.37;
      const shopRare = baseValue(r?.ShopRareOdds, 0.09);
      const shopRareAsc = ascendedValue(r?.ShopRareOdds, 0.045);
      const baseOffset = r?._baseRarityOffset ?? -0.05;
      const maxOffset = r?._maxRarityOffset ?? 0.4;
      const rarityGrowth = baseValue(r?.RarityGrowth, 0.01);
      const rarityGrowthAsc = ascendedValue(r?.RarityGrowth, 0.005);
      return (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={card}>
              <h3 className={h3}>Normal Fights</h3>
              <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th><th className={thr2}>A7+</th></tr></thead><tbody>
                <tr className={tr}><td className={td}>Common</td><td className={tdr}>{pct(normalCommon)}</td><td className={tdr}>{pct(normalCommonAsc)}</td></tr>
                <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>{pct(normalUncommon)}</td><td className={tdr}>{pct(normalUncommon)}</td></tr>
                <tr><td className={td}>Rare</td><td className={gold}>{pct(normalRare)}</td><td className={gold}>{pct(normalRareAsc)}</td></tr>
              </tbody></table>
            </div>
            <div className={card}>
              <h3 className={h3}>Elite Fights</h3>
              <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th><th className={thr2}>A7+</th></tr></thead><tbody>
                <tr className={tr}><td className={td}>Common</td><td className={tdr}>{pct(eliteCommon)}</td><td className={tdr}>{pct(eliteCommonAsc)}</td></tr>
                <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>{pct(eliteUncommon)}</td><td className={tdr}>{pct(eliteUncommon)}</td></tr>
                <tr><td className={td}>Rare</td><td className={gold}>{pct(eliteRare)}</td><td className={gold}>{pct(eliteRareAsc)}</td></tr>
              </tbody></table>
            </div>
            <div className={card}>
              <h3 className={h3}>Boss Fights</h3>
              <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th></tr></thead><tbody>
                <tr><td className={td}>Rare</td><td className={gold}>{pct(bossRare)}</td></tr>
              </tbody></table>
              <p className={note}>Boss card rewards are always rare.</p>
            </div>
            <div className={card}>
              <h3 className={h3}>Shop</h3>
              <table className={tbl}><thead><tr className={thr}><th className={th}>Rarity</th><th className={thr2}>Chance</th><th className={thr2}>A7+</th></tr></thead><tbody>
                <tr className={tr}><td className={td}>Common</td><td className={tdr}>{pct(shopCommon)}</td><td className={tdr}>{pct(shopCommonAsc)}</td></tr>
                <tr className={tr}><td className={td}>Uncommon</td><td className={tdr}>{pct(shopUncommon)}</td><td className={tdr}>{pct(shopUncommon)}</td></tr>
                <tr><td className={td}>Rare</td><td className={gold}>{pct(shopRare)}</td><td className={gold}>{pct(shopRareAsc)}</td></tr>
              </tbody></table>
            </div>
          </div>
          <div className={`${card} mt-4`}>
            <h3 className={h3}>Rare Card Pity System</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              A hidden offset starts at <strong className={bold}>{pct(baseOffset)}</strong> and increases by <strong className={bold}>+{pct(rarityGrowth)}</strong> for each non-rare card <em>shown</em> in a combat reward (+{pct(rarityGrowthAsc)} on A7+) — including ones you skip. When a rare is rolled, the offset resets to {pct(baseOffset)}. Caps at <strong className={bold}>+{pct(maxOffset)}</strong>. Each combat reward generates 3 cards up front, so a skipped reward still ticks the counter 3 times. This ensures you see rares more often the longer you go without one.
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
    }

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

    case "gold-rewards": {
      // Encounter ranges from EncounterModel.cs switches; Poverty
      // multiplier from AscensionHelper. Treasure rooms aren't in the
      // EncounterModel switch (handled by treasure-specific encounter
      // classes elsewhere), so they stay as a hardcoded row for now.
      const monster = encounterGold?.Monster ?? { min: 10, max: 20 };
      const elite = encounterGold?.Elite ?? { min: 35, max: 45 };
      const boss = encounterGold?.Boss ?? { min: 100, max: 100 };
      const poverty = ascensionHelper?.PovertyAscensionGoldMultiplier ?? 0.75;
      const fmt = (r: { min: number; max: number }) =>
        r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`;
      const ascended = (r: { min: number; max: number }) => ({
        min: Math.round(r.min * poverty),
        max: Math.round(r.max * poverty),
      });
      // Treasure room range — see comment above. Pre-Poverty value
      // taken from the prior hand-coded table; Mega Crit hasn't
      // shipped a dedicated source we can mine yet.
      const treasure = { min: 42, max: 52 };
      return (
        <div className={card}>
          <table className={tbl}>
            <thead>
              <tr className={thr}>
                <th className={th}>Source</th>
                <th className={thr2}>Gold</th>
                <th className={thr2}>A3+</th>
              </tr>
            </thead>
            <tbody>
              <tr className={tr}>
                <td className={td}>Normal fight</td>
                <td className={gold}>{fmt(monster)}</td>
                <td className={gold}>{fmt(ascended(monster))}</td>
              </tr>
              <tr className={tr}>
                <td className={td}>Elite fight</td>
                <td className={gold}>{fmt(elite)}</td>
                <td className={gold}>{fmt(ascended(elite))}</td>
              </tr>
              <tr className={tr}>
                <td className={td}>Boss fight</td>
                <td className={gold}>{fmt(boss)}</td>
                <td className={gold}>{fmt(ascended(boss))}</td>
              </tr>
              <tr>
                <td className={td}>Treasure room</td>
                <td className={gold}>{fmt(treasure)}</td>
                <td className={gold}>{fmt(ascended(treasure))}</td>
              </tr>
            </tbody>
          </table>
          <p className={note}>
            Ascension 3 (Poverty) multiplies all gold rewards by {poverty}x. If enemies escape during combat, gold is proportionally reduced.
          </p>
        </div>
      );
    }

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

    case "combat-mechanics": {
      // Multipliers come from `combat_modifiers` in the parsed C#
      // constants. Fallbacks mirror the v0.103.2 stable values
      // (Vulnerable 1.5x, Weak/Frail 0.75x) so the page still renders
      // when the API is down or the file is missing.
      const vuln = combatModifiers?.Vulnerable?.value ?? 1.5;
      const weak = combatModifiers?.Weak?.value ?? 0.75;
      const frail = combatModifiers?.Frail?.value ?? 0.75;
      return (
        <>
          <div className={card}>
            <h3 className={h3}>Attack Mechanics</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              An attack&rsquo;s damage is computed in a fixed order. First, the printed value is added to the attacker&rsquo;s <strong className={bold}>Strength</strong> stacks (one stack = +1 damage, additive — negative stacks reduce damage). The total is then multiplied by <strong className={bold}>{mult(weak)}</strong> if the attacker has <strong className={bold}>Weak</strong>, and by <strong className={bold}>{mult(vuln)}</strong> if the target has <strong className={bold}>Vulnerable</strong>. Whatever&rsquo;s left is absorbed by the target&rsquo;s <strong className={bold}>Block</strong>; any remainder hits HP.
            </p>
            <p className={`${note} mt-2`}>
              Block follows the mirror path: card block + <strong className={bold}>Dexterity</strong> stacks, then multiplied by <strong className={bold}>{mult(frail)}</strong> if the player has <strong className={bold}>Frail</strong>. Multi-hit attacks apply the full pipeline per hit. Source: <span className="font-mono">VulnerablePower</span>, <span className="font-mono">WeakPower</span>, <span className="font-mono">FrailPower</span>, <span className="font-mono">StrengthPower</span>, <span className="font-mono">DexterityPower</span>.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
                <tr className={tr}><td className={td}>Vulnerable</td><td className={gold}>{mult(vuln)} damage taken</td></tr>
                <tr className={tr}><td className={td}>Weak</td><td className={gold}>{mult(weak)} damage dealt</td></tr>
                <tr><td className={td}>Frail</td><td className={gold}>{mult(frail)} block from cards</td></tr>
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
    }

    case "character-stats": {
      // Fallback values mirror the C# constants in
      // `Models.Characters/{Char}.cs::StartingHp` so a backend outage at
      // build/render time still serves the right table. Kept in sync by
      // the same `parse_all.py` run that feeds /api/characters.
      const fallback: CharacterStatsRow[] = [
        { id: "IRONCLAD", name: "Ironclad", starting_hp: 80, starting_gold: 99, deck_size: 10, orb_slots: 0 },
        { id: "SILENT", name: "Silent", starting_hp: 70, starting_gold: 99, deck_size: 12, orb_slots: 0 },
        { id: "DEFECT", name: "Defect", starting_hp: 75, starting_gold: 99, deck_size: 10, orb_slots: 3 },
        { id: "NECROBINDER", name: "Necrobinder", starting_hp: 66, starting_gold: 99, deck_size: 10, orb_slots: 0 },
        { id: "REGENT", name: "Regent", starting_hp: 75, starting_gold: 99, deck_size: 10, orb_slots: 0 },
      ];
      const rows = characterStats?.length ? characterStats : fallback;
      return (
        <div className={card}>
          <table className={tbl}>
            <thead>
              <tr className={thr}>
                <th className={th}>Character</th>
                <th className={thr2}>HP</th>
                <th className={thr2}>Gold</th>
                <th className={thr2}>Deck</th>
                <th className={thr2}>Orb Slots</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} className={i < rows.length - 1 ? tr : undefined}>
                  <td className={td}>{c.name.replace(/^The\s+/, "")}</td>
                  <td className={gold}>{c.starting_hp}</td>
                  <td className={tdr}>{c.starting_gold}</td>
                  <td className={tdr}>{c.deck_size}</td>
                  <td className={tdr}>{c.orb_slots}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={note}>All characters start with 3 energy and 3 potion slots.</p>
        </div>
      );
    }

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

    case "ascension-modifiers": {
      // Ordered list comes from the parsed `AscensionLevel` C# enum so
      // Mega Crit can't add or rename a level without us catching it on
      // the next render. Effect descriptions stay hand-curated keyed on
      // the enum name — they're prose, not values, and re-deriving them
      // would require parsing every consumer site of AscensionHelper
      // throughout the C# tree.
      const EFFECTS: Record<string, { display: string; effect: string }> = {
        SwarmingElites: { display: "Swarming Elites", effect: "5 → 8 elites on map" },
        WearyTraveler: { display: "Weary Traveler", effect: "Ancient heals only 80%" },
        Poverty: { display: "Poverty", effect: "Gold rewards x0.75" },
        TightBelt: { display: "Tight Belt", effect: "3 → 2 potion slots" },
        AscendersBane: { display: "Ascender's Bane", effect: "Start with Ascender's Bane curse" },
        Inflation: { display: "Inflation", effect: "Card removal at the Merchant is more expensive (base 100g, +50g per use)" },
        Scarcity: { display: "Scarcity", effect: "~50% rarer cards, slower pity" },
        ToughEnemies: { display: "Tough Enemies", effect: "Enemy HP increases (per-enemy)" },
        DeadlyEnemies: { display: "Deadly Enemies", effect: "Enemy damage increases (per-enemy)" },
        DoubleBoss: { display: "Double Boss", effect: "Two bosses at end of the final act" },
      };
      const fallback = [
        "SwarmingElites", "WearyTraveler", "Poverty", "TightBelt", "AscendersBane",
        "Inflation", "Scarcity", "ToughEnemies", "DeadlyEnemies", "DoubleBoss",
      ];
      const levels = ascensionLevels?.length ? ascensionLevels : fallback;
      return (
        <div className={card}>
          <table className={tbl}>
            <thead>
              <tr className={thr}>
                <th className={th}>Level</th>
                <th className={th}>Name</th>
                <th className={thr2}>Effect</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((key, i) => {
                const e = EFFECTS[key] ?? { display: key, effect: "—" };
                const isLast = i === levels.length - 1;
                return (
                  <tr key={key} className={isLast ? undefined : tr}>
                    <td className={td}>{i + 1}</td>
                    <td className={td}>{e.display}</td>
                    <td className={tdr}>{e.effect}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    case "score-formula":
      return (
        <>
          <div className={card}>
            <h3 className={h3}>Run Score</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
              Awarded for every completed run, win or lose. Shown on the run-history screen and used by the final-boss scene to render the &quot;damage&quot; numbers on the Architect.
            </p>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Component</th><th className={thr2}>Value</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Rooms visited</td><td className={tdr}>10 pts per room <span className="text-[var(--text-muted)]">x act number (x1 / x2 / x3)</span></td></tr>
              <tr className={tr}><td className={td}>Gold gained</td><td className={tdr}>+1 pt per 100 gold <span className="text-[var(--text-muted)]">(divided by player count)</span></td></tr>
              <tr className={tr}><td className={td}>Elites killed</td><td className={gold}>+50 each <span className="text-[var(--text-muted)]">(the elite you died to doesn&apos;t count)</span></td></tr>
              <tr className={tr}><td className={td}>Bosses slain</td><td className={gold}>+100 each <span className="text-[var(--text-muted)]">(3 on a win, fewer if you die earlier; A10 wins count 4)</span></td></tr>
              <tr><td className={td}>Ascension multiplier</td><td className={gold}>x(1 + ascension x 0.1)</td></tr>
            </tbody></table>
            <p className={note}>
              Final = <span className="text-[var(--text-secondary)]">(rooms + gold + elites + bosses) x (1 + ascension x 0.1)</span>. At A10 your score is doubled. Source: <span className="font-mono">ScoreUtility.CalculateScore</span>.
            </p>
          </div>

          <div className={`${card} mt-4`}>
            <h3 className={h3}>Worked example</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
              Hypothetical A0 win — 15 rooms in act 1, 14 in act 2, 14 in act 3, 4 elites killed, 3 bosses, 1,200 gold gained, single player.
            </p>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Component</th><th className={thr2}>Math</th><th className={thr2}>Pts</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Act 1 rooms</td><td className={tdr}>15 x 10 x 1</td><td className={gold}>150</td></tr>
              <tr className={tr}><td className={td}>Act 2 rooms</td><td className={tdr}>14 x 10 x 2</td><td className={gold}>280</td></tr>
              <tr className={tr}><td className={td}>Act 3 rooms</td><td className={tdr}>14 x 10 x 3</td><td className={gold}>420</td></tr>
              <tr className={tr}><td className={td}>Gold</td><td className={tdr}>1200 / 100</td><td className={gold}>12</td></tr>
              <tr className={tr}><td className={td}>Elites</td><td className={tdr}>4 x 50</td><td className={gold}>200</td></tr>
              <tr className={tr}><td className={td}>Bosses</td><td className={tdr}>3 x 100</td><td className={gold}>300</td></tr>
              <tr><td className={td}>Subtotal x A0 multiplier</td><td className={tdr}>1,362 x 1.0</td><td className="py-2 text-right text-[var(--accent-gold)] font-bold">1,362</td></tr>
            </tbody></table>
            <p className={note}>The same run on A10 would multiply by 2.0 for a final score of 2,724. Each A-tier adds +10% — there&apos;s no diminishing return.</p>
          </div>

          <div className={`${card} mt-4`}>
            <h3 className={h3}>Daily-Run Leaderboard Score</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
              Daily runs use a completely separate scoring system that&apos;s a single packed integer. The digits ARE the sort order — a numeric DESC sort gives the right ranking, no separate columns needed. Major Update #1 introduced this so &quot;the score sent to the leaderboards is based on whether you won, how many badges you accrued, and how quickly you finished the run (in that order)&quot;.
            </p>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Bucket</th><th className={thr2}>Multiplier</th><th className={thr2}>Range</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Victory flag</td><td className={tdr}>x 100,000,000</td><td className={gold}>1 = loss, 2 = win</td></tr>
              <tr className={tr}><td className={td}>Floors visited</td><td className={tdr}>x 1,000,000</td><td className={gold}>0–99</td></tr>
              <tr className={tr}><td className={td}>Badges earned</td><td className={tdr}>x 10,000</td><td className={gold}>0–99</td></tr>
              <tr><td className={td}>Run time</td><td className={tdr}>9999 − seconds</td><td className={gold}>faster = higher</td></tr>
            </tbody></table>
            <p className={note}>Source: <span className="font-mono">ScoreUtility.CalculateDailyScore</span>. The matching <span className="font-mono">DecodeDailyScore</span> peels the integer back into <span className="font-mono">{`{ victory, floors, badges, runTime }`}</span> for display.</p>
          </div>

          <div className={`${card} mt-4`}>
            <h3 className={h3}>Daily-score worked example</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
              An A10 daily win — 48 floors visited, 7 badges earned, completed in 1,842 seconds (30:42).
            </p>
            <table className={tbl}><thead><tr className={thr}><th className={th}>Bucket</th><th className={thr2}>Math</th><th className={thr2}>Contribution</th></tr></thead><tbody>
              <tr className={tr}><td className={td}>Victory (win)</td><td className={tdr}>2 x 100,000,000</td><td className={gold}>200,000,000</td></tr>
              <tr className={tr}><td className={td}>Floors</td><td className={tdr}>48 x 1,000,000</td><td className={gold}>48,000,000</td></tr>
              <tr className={tr}><td className={td}>Badges</td><td className={tdr}>7 x 10,000</td><td className={gold}>70,000</td></tr>
              <tr className={tr}><td className={td}>Time</td><td className={tdr}>9999 − 1842</td><td className={gold}>8,157</td></tr>
              <tr><td className={td}>Total packed score</td><td className={tdr}></td><td className="py-2 text-right text-[var(--accent-gold)] font-bold">248,078,157</td></tr>
            </tbody></table>
            <p className={note}>Beat someone&apos;s 248,070,XXX score? You won, hit at least 48 floors, and got 7+ badges. Faster runs win at every tier of the comparison.</p>
          </div>

          <div className={`${card} mt-4`}>
            <h3 className={h3}>Why two scores?</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              The <strong className={bold}>run score</strong> is descriptive — it tells you how good a single run was at a glance, weighted heavily toward depth (act 3 rooms count 3x). The <strong className={bold}>daily score</strong> is a sorting key — it has to compare two runs deterministically and produce one winner. Mega Crit packed it as a single integer so the leaderboard can be sorted with one column and no tiebreaker logic.
            </p>
            <p className={note}>
              The constant <span className="font-mono">clientScore = -999999999</span> is a sentinel for &quot;this row was sent without a server-computed score&quot; — used to filter unverified entries from the leaderboard view.
            </p>
          </div>
        </>
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
