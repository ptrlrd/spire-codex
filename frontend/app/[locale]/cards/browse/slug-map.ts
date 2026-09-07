export interface SlugEntry {
  params: Record<string, string>;
  label: string;
  description: string;
  category: "type" | "rarity" | "character" | "keyword" | "combo";
}

export const SLUG_MAP: Record<string, SlugEntry> = {
  // --- By Type ---
  attacks: {
    params: { type: "Attack" },
    label: "Attack Cards",
    description: "All Attack cards in Slay the Spire 2. Attacks deal damage to enemies and are the primary offensive tools in your deck.",
    category: "type",
  },
  skills: {
    params: { type: "Skill" },
    label: "Skill Cards",
    description: "All Skill cards in Slay the Spire 2. Skills provide block, draw, and utility effects to support your strategy.",
    category: "type",
  },
  powers: {
    params: { type: "Power" },
    label: "Power Cards",
    description: "All Power cards in Slay the Spire 2. Powers remain in play for the rest of combat, providing lasting effects.",
    category: "type",
  },

  // --- By Rarity ---
  common: {
    params: { rarity: "Common" },
    label: "Common Cards",
    description: "All Common rarity cards in Slay the Spire 2. Common cards appear most frequently in card rewards.",
    category: "rarity",
  },
  uncommon: {
    params: { rarity: "Uncommon" },
    label: "Uncommon Cards",
    description: "All Uncommon rarity cards in Slay the Spire 2. Uncommon cards offer stronger effects than Commons.",
    category: "rarity",
  },
  rare: {
    params: { rarity: "Rare" },
    label: "Rare Cards",
    description: "All Rare rarity cards in Slay the Spire 2. Rare cards are the most powerful and appear least often in rewards.",
    category: "rarity",
  },

  // --- By Character ---
  ironclad: {
    params: { color: "ironclad" },
    label: "Ironclad Cards",
    description: "All Ironclad character cards in Slay the Spire 2. The Ironclad specializes in strength, self-damage, and exhausting cards.",
    category: "character",
  },
  silent: {
    params: { color: "silent" },
    label: "Silent Cards",
    description: "All Silent character cards in Slay the Spire 2. The Silent focuses on poison, shivs, and discard synergies.",
    category: "character",
  },
  defect: {
    params: { color: "defect" },
    label: "Defect Cards",
    description: "All Defect character cards in Slay the Spire 2. The Defect channels orbs for lightning, frost, dark, and plasma effects.",
    category: "character",
  },
  necrobinder: {
    params: { color: "necrobinder" },
    label: "Necrobinder Cards",
    description: "All Necrobinder character cards in Slay the Spire 2. The Necrobinder uses minions and dark magic.",
    category: "character",
  },
  regent: {
    params: { color: "regent" },
    label: "Regent Cards",
    description: "All Regent character cards in Slay the Spire 2. The Regent commands powerful abilities with unique mechanics.",
    category: "character",
  },

  // --- By Keyword ---
  exhaust: {
    params: { keyword: "Exhaust" },
    label: "Exhaust Cards",
    description: "All cards with the Exhaust keyword in Slay the Spire 2. Exhaust cards are removed from your deck when played.",
    category: "keyword",
  },
  ethereal: {
    params: { keyword: "Ethereal" },
    label: "Ethereal Cards",
    description: "All cards with the Ethereal keyword in Slay the Spire 2. Ethereal cards are discarded if still in hand at end of turn.",
    category: "keyword",
  },
  innate: {
    params: { keyword: "Innate" },
    label: "Innate Cards",
    description: "All cards with the Innate keyword in Slay the Spire 2. Innate cards always appear in your opening hand.",
    category: "keyword",
  },
  retain: {
    params: { keyword: "Retain" },
    label: "Retain Cards",
    description: "All cards with the Retain keyword in Slay the Spire 2. Retain cards stay in your hand at end of turn.",
    category: "keyword",
  },
  sly: {
    params: { keyword: "Sly" },
    label: "Sly Cards",
    description: "All cards with the Sly keyword in Slay the Spire 2. Sly cards can be played from the discard pile.",
    category: "keyword",
  },
  eternal: {
    params: { keyword: "Eternal" },
    label: "Eternal Cards",
    description: "All cards with the Eternal keyword in Slay the Spire 2. Eternal cards cannot be removed from your deck.",
    category: "keyword",
  },

  // --- Rarity + Type Combos ---
  "common-attacks": {
    params: { rarity: "Common", type: "Attack" },
    label: "Common Attack Cards",
    description: "All Common Attack cards in Slay the Spire 2. Browse every common rarity attack across all characters.",
    category: "combo",
  },
  "common-skills": {
    params: { rarity: "Common", type: "Skill" },
    label: "Common Skill Cards",
    description: "All Common Skill cards in Slay the Spire 2. Browse every common rarity skill across all characters.",
    category: "combo",
  },
  "common-powers": {
    params: { rarity: "Common", type: "Power" },
    label: "Common Power Cards",
    description: "All Common Power cards in Slay the Spire 2. Browse every common rarity power across all characters.",
    category: "combo",
  },
  "uncommon-attacks": {
    params: { rarity: "Uncommon", type: "Attack" },
    label: "Uncommon Attack Cards",
    description: "All Uncommon Attack cards in Slay the Spire 2. Browse every uncommon rarity attack across all characters.",
    category: "combo",
  },
  "uncommon-skills": {
    params: { rarity: "Uncommon", type: "Skill" },
    label: "Uncommon Skill Cards",
    description: "All Uncommon Skill cards in Slay the Spire 2. Browse every uncommon rarity skill across all characters.",
    category: "combo",
  },
  "uncommon-powers": {
    params: { rarity: "Uncommon", type: "Power" },
    label: "Uncommon Power Cards",
    description: "All Uncommon Power cards in Slay the Spire 2. Browse every uncommon rarity power across all characters.",
    category: "combo",
  },
  "rare-attacks": {
    params: { rarity: "Rare", type: "Attack" },
    label: "Rare Attack Cards",
    description: "All Rare Attack cards in Slay the Spire 2. Browse every rare rarity attack across all characters.",
    category: "combo",
  },
  "rare-skills": {
    params: { rarity: "Rare", type: "Skill" },
    label: "Rare Skill Cards",
    description: "All Rare Skill cards in Slay the Spire 2. Browse every rare rarity skill across all characters.",
    category: "combo",
  },
  "rare-powers": {
    params: { rarity: "Rare", type: "Power" },
    label: "Rare Power Cards",
    description: "All Rare Power cards in Slay the Spire 2. Browse every rare rarity power across all characters.",
    category: "combo",
  },

  // --- Character + Type Combos ---
  "ironclad-attacks": {
    params: { color: "ironclad", type: "Attack" },
    label: "Ironclad Attack Cards",
    description: "All Ironclad Attack cards in Slay the Spire 2. Every attack in the Ironclad's card pool.",
    category: "combo",
  },
  "ironclad-skills": {
    params: { color: "ironclad", type: "Skill" },
    label: "Ironclad Skill Cards",
    description: "All Ironclad Skill cards in Slay the Spire 2. Every skill in the Ironclad's card pool.",
    category: "combo",
  },
  "ironclad-powers": {
    params: { color: "ironclad", type: "Power" },
    label: "Ironclad Power Cards",
    description: "All Ironclad Power cards in Slay the Spire 2. Every power in the Ironclad's card pool.",
    category: "combo",
  },
  "silent-attacks": {
    params: { color: "silent", type: "Attack" },
    label: "Silent Attack Cards",
    description: "All Silent Attack cards in Slay the Spire 2. Every attack in the Silent's card pool.",
    category: "combo",
  },
  "silent-skills": {
    params: { color: "silent", type: "Skill" },
    label: "Silent Skill Cards",
    description: "All Silent Skill cards in Slay the Spire 2. Every skill in the Silent's card pool.",
    category: "combo",
  },
  "silent-powers": {
    params: { color: "silent", type: "Power" },
    label: "Silent Power Cards",
    description: "All Silent Power cards in Slay the Spire 2. Every power in the Silent's card pool.",
    category: "combo",
  },
  "defect-attacks": {
    params: { color: "defect", type: "Attack" },
    label: "Defect Attack Cards",
    description: "All Defect Attack cards in Slay the Spire 2. Every attack in the Defect's card pool.",
    category: "combo",
  },
  "defect-skills": {
    params: { color: "defect", type: "Skill" },
    label: "Defect Skill Cards",
    description: "All Defect Skill cards in Slay the Spire 2. Every skill in the Defect's card pool.",
    category: "combo",
  },
  "defect-powers": {
    params: { color: "defect", type: "Power" },
    label: "Defect Power Cards",
    description: "All Defect Power cards in Slay the Spire 2. Every power in the Defect's card pool.",
    category: "combo",
  },
  "necrobinder-attacks": {
    params: { color: "necrobinder", type: "Attack" },
    label: "Necrobinder Attack Cards",
    description: "All Necrobinder Attack cards in Slay the Spire 2. Every attack in the Necrobinder's card pool.",
    category: "combo",
  },
  "necrobinder-skills": {
    params: { color: "necrobinder", type: "Skill" },
    label: "Necrobinder Skill Cards",
    description: "All Necrobinder Skill cards in Slay the Spire 2. Every skill in the Necrobinder's card pool.",
    category: "combo",
  },
  "necrobinder-powers": {
    params: { color: "necrobinder", type: "Power" },
    label: "Necrobinder Power Cards",
    description: "All Necrobinder Power cards in Slay the Spire 2. Every power in the Necrobinder's card pool.",
    category: "combo",
  },
  "regent-attacks": {
    params: { color: "regent", type: "Attack" },
    label: "Regent Attack Cards",
    description: "All Regent Attack cards in Slay the Spire 2. Every attack in the Regent's card pool.",
    category: "combo",
  },
  "regent-skills": {
    params: { color: "regent", type: "Skill" },
    label: "Regent Skill Cards",
    description: "All Regent Skill cards in Slay the Spire 2. Every skill in the Regent's card pool.",
    category: "combo",
  },
  "regent-powers": {
    params: { color: "regent", type: "Power" },
    label: "Regent Power Cards",
    description: "All Regent Power cards in Slay the Spire 2. Every power in the Regent's card pool.",
    category: "combo",
  },
};

/** All valid slugs for sitemap generation and static params */
export const ALL_BROWSE_SLUGS = Object.keys(SLUG_MAP);
