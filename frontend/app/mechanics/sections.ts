export interface MechanicSection {
  slug: string;
  title: string;
  description: string;
  category: "mechanics" | "secrets";
}

export const MECHANIC_SECTIONS: MechanicSection[] = [
  { slug: "card-rarity", title: "Card Rarity Odds", description: "Card rarity probabilities for normal fights, elite fights, boss fights, and shops. Includes rare card pity system and ascension modifiers.", category: "mechanics" },
  { slug: "relic-distribution", title: "Relic Rarity Distribution", description: "Relic rarity chances from elite fights, treasure rooms, and shops. Common 50%, Uncommon 33%, Rare 17%.", category: "mechanics" },
  { slug: "potion-drop-rates", title: "Potion Drop Rates", description: "Potion drop chances from combat with adaptive pity system. Base 40% chance, capped at 50%, with elite bonus.", category: "mechanics" },
  { slug: "gold-rewards", title: "Gold Rewards", description: "Exact gold reward ranges for normal fights (10-20), elite fights (35-45), boss fights (100), and treasure rooms (42-52).", category: "mechanics" },
  { slug: "shop-inventory", title: "Shop Inventory", description: "Shop layout — 5 character cards, 2 colorless, 3 relics, 3 potions, card removal scaling (75 + 25n gold).", category: "mechanics" },
  { slug: "map-generation", title: "Map Generation", description: "How the map is built — act structure, room counts, elite placement rules, and room distribution.", category: "mechanics" },
  { slug: "unknown-rooms", title: "Unknown Room Probabilities", description: "What happens when you enter a '?' room — adaptive probability system for events, fights, shops, and treasure.", category: "mechanics" },
  { slug: "bosses-and-elites", title: "Bosses & Elites by Act", description: "Which 3 bosses and 3 elites can appear in each act — Overgrowth, Underdocks, Hive, and Glory.", category: "mechanics" },
  { slug: "combat-mechanics", title: "Combat Mechanics", description: "Hand size (5 draw, 10 max), energy (3 base), block decay, damage formulas — Strength, Dexterity, Vulnerable, Weak, Frail.", category: "mechanics" },
  { slug: "character-stats", title: "Character Starting Stats", description: "Starting HP, gold, deck size, and orb slots for Ironclad, Silent, Defect, Necrobinder, and Regent.", category: "mechanics" },
  { slug: "orb-mechanics", title: "Orb Mechanics", description: "Defect orb system — Lightning, Frost, Dark, Plasma, and Glass passive and evoke values. 3 starting slots, 10 max.", category: "mechanics" },
  { slug: "campfire-options", title: "Campfire Options", description: "All 8 rest site choices — Rest, Smith, Dig, Lift, Cook, Clone, Hatch, and Mend. Some require specific relics or cards.", category: "mechanics" },
  { slug: "neow", title: "Neow Offerings", description: "Starting Ancient Neow offers 3 relics — 2 positive and 1 curse. Full relic pools and conflict prevention rules.", category: "mechanics" },
  { slug: "ascension-modifiers", title: "Ascension Modifiers", description: "All 10 ascension levels and their effects — from Swarming Elites (A1) to Double Boss (A10).", category: "mechanics" },
  { slug: "enemy-ascension-scaling", title: "Enemy Ascension Scaling", description: "Per-monster HP and damage bumps applied at ToughEnemies (A7) and DeadlyEnemies (A2). Sortable table covering every monster in the bestiary.", category: "mechanics" },
  { slug: "score-formula", title: "Scoring & Daily Leaderboards", description: "How your run score is calculated — 10 points per room, act multipliers, elite/boss/gold bonuses, and ascension scaling. Plus the packed daily-leaderboard score format added in Major Update #1.", category: "mechanics" },
  { slug: "foul-potion", title: "The Foul Potion Has 3 Uses", description: "The most context-sensitive item in the game — combat damage, merchant gold, and Fake Merchant boss trigger.", category: "secrets" },
  { slug: "wongo-loyalty", title: "Wongo's Cross-Run Loyalty Points", description: "A hidden loyalty system that persists across runs. Earn points toward a badge relic, but leaving without buying downgrades a card.", category: "secrets" },
  { slug: "crystal-sphere", title: "Crystal Sphere Minesweeper", description: "The Crystal Sphere event is a hidden-object minigame on an 11x11 grid with relics, potions, cards, and a hidden curse.", category: "secrets" },

  { slug: "reflections", title: "The Reflections Event Can Double Your Deck", description: "The Shatter option clones every card in your deck 1:1, doubling its size. The catch: a Bad Luck curse.", category: "secrets" },
  { slug: "the-architect", title: "The Architect Can't Fight You", description: "The final encounter has 9,999 HP but can't attack. It's a dialogue scene where your score determines the visual damage.", category: "secrets" },
  { slug: "orobas-prismatic", title: "Orobas and the Prismatic Gem", description: "The Ancient Orobas in Act 2 has a ~8% chance to offer the Prismatic Gem — 33% chance it enters the pool, then 1-in-4 to be picked.", category: "secrets" },
  { slug: "byrdpip", title: "Byrdpip Is Invincible and Does Nothing", description: "The Byrdpip pet has 9,999 HP, a hidden health bar, and its only move is NOTHING_MOVE. It has 4 random skins.", category: "secrets" },
  { slug: "merchant-blacklist", title: "Two Relics Are Banned From Shops", description: "The Courier and Old Coin are hardcoded into the merchant blacklist — they can never appear in shops.", category: "secrets" },
  { slug: "autoslay", title: "The Game Has a Built-In AI Player", description: "AutoSlay is a full automated player for CI testing — picks a random character, plays to floor 49 with a 25-minute timeout.", category: "secrets" },
  { slug: "dev-console", title: "Dev Console God Mode", description: "39 developer console commands including godmode (9,999 Strength + Buffer + Regen), instant death, and trailer mode.", category: "secrets" },
  { slug: "the-deprived", title: "The Deprived: A Hidden Test Character", description: "A debug character with 1,000 HP, 100 energy, an empty deck, and no relics. Purple color scheme, neutral gender.", category: "secrets" },
];

export function getSectionBySlug(slug: string): MechanicSection | undefined {
  return MECHANIC_SECTIONS.find((s) => s.slug === slug);
}
