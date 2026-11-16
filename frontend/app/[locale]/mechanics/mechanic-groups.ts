export interface MechanicSectionMeta {
  slug: string;
  title: string;
  description: string;
  category: "mechanics" | "secrets";
  order: number;
}

export interface MechanicGroup {
  id: string;
  label: string;
  icon: string;
  slugs: string[];
}

const IMG = "/static/images";

export const MECHANIC_GROUPS: MechanicGroup[] = [
  {
    id: "rewards",
    label: "Rewards",
    icon: `${IMG}/ui/rewards/reward_icon_money.webp`,
    slugs: [
      "card-rarity",
      "relic-distribution",
      "potion-drop-rates",
      "gold-rewards",
      "shop-inventory",
    ],
  },
  {
    id: "map",
    label: "Map",
    icon: `${IMG}/ui/top_bar/top_bar_map.webp`,
    slugs: [
      "map-generation",
      "unknown-rooms",
      "campfire-options",
      "neow",
      "bosses-and-elites",
    ],
  },
  {
    id: "combat",
    label: "Combat",
    icon: `${IMG}/powers/strength_power.webp`,
    slugs: ["combat-mechanics", "orb-mechanics", "character-stats"],
  },
  {
    id: "ascension",
    label: "Ascension",
    icon: `${IMG}/ui/top_bar/top_bar_ascension.webp`,
    slugs: ["ascension-modifiers", "enemy-ascension-scaling", "score-formula"],
  },
];

export const OTHER_GROUP: MechanicGroup = {
  id: "more-mechanics",
  label: "Mechanics",
  icon: `${IMG}/ui/top_bar/top_bar_deck.png`,
  slugs: [],
};

export const SECRETS_GROUP: MechanicGroup = {
  id: "secrets",
  label: "Secrets & Trivia",
  icon: `${IMG}/ui/map_nodes/map_unknown.png`,
  slugs: [],
};

const ENTRY_ICON: Record<string, string> = {
  "card-rarity": `${IMG}/ui/top_bar/top_bar_deck.png`,
  "relic-distribution": `${IMG}/relics/burning_blood.webp`,
  "potion-drop-rates": `${IMG}/potions/fire_potion.webp`,
  "gold-rewards": `${IMG}/ui/rewards/reward_icon_money.webp`,
  "shop-inventory": `${IMG}/misc/merchant.webp`,
  "map-generation": `${IMG}/ui/top_bar/top_bar_map.webp`,
  "unknown-rooms": `${IMG}/ui/map_nodes/map_unknown.png`,
  "campfire-options": `${IMG}/ui/map_nodes/map_rest.png`,
  neow: `${IMG}/misc/ancients/neow.webp`,
  "bosses-and-elites": `${IMG}/ui/map_nodes/map_elite.png`,
  "combat-mechanics": `${IMG}/powers/strength_power.webp`,
  "orb-mechanics": `${IMG}/orbs/lightning_orb.png`,
  "character-stats": `${IMG}/characters/character_icon_ironclad.webp`,
  "ascension-modifiers": `${IMG}/ui/top_bar/top_bar_ascension.webp`,
  "enemy-ascension-scaling": `${IMG}/powers/vulnerable_power.webp`,
  "score-formula": `${IMG}/icons/star_icon.webp`,
  "foul-potion": `${IMG}/potions/foul_potion.webp`,
  "wongo-loyalty": `${IMG}/relics/wongo_customer_appreciation_badge.webp`,
  "the-architect": `${IMG}/monsters/architect.webp`,
  "orobas-prismatic": `${IMG}/misc/ancients/orobas.webp`,
  byrdpip: `${IMG}/monsters/byrdpip.webp`,
  "merchant-blacklist": `${IMG}/relics/the_courier.webp`,
};

const ENTRY_LEAD: Record<string, string> = {
  "relic-distribution": "Common 50%, Uncommon 33%, Rare 17%",
  "potion-drop-rates": "Starts at 40%, ±10% per combat",
  "gold-rewards":
    "normal fights (10-20), elite fights (35-45), boss fights (100), and treasure rooms (42-52)",
  "shop-inventory": "5 character cards, 2 colorless, 3 relics, 3 potions",
  "bosses-and-elites": "3 bosses and 3 elites can appear in each act",
  "combat-mechanics": "Hand size (5 draw, 10 max), energy (3 base)",
  "orb-mechanics": "3 starting slots, 10 max",
  "campfire-options": "All 9 rest site choices",
  neow: "3 relics — 2 positive and 1 curse",
  "ascension-modifiers": "10 ascension levels",
  "score-formula": "10 points per room",
  "crystal-sphere": "11x11 grid",
  reflections: "clones every card in your deck 1:1",
  "the-architect": "9,999 HP but can't attack",
  "orobas-prismatic": "~8% chance to offer the Prismatic Gem",
  byrdpip: "9,999 HP",
  autoslay: "plays to floor 49 with a 25-minute timeout",
  "dev-console": "39 developer console commands",
  "the-deprived": "1,000 HP, 100 energy",
};

export function groupOf(section: MechanicSectionMeta): MechanicGroup {
  if (section.category === "secrets") return SECRETS_GROUP;
  return (
    MECHANIC_GROUPS.find((g) => g.slugs.includes(section.slug)) ?? OTHER_GROUP
  );
}

export function groupSections(
  sections: MechanicSectionMeta[],
): { group: MechanicGroup; items: MechanicSectionMeta[] }[] {
  const order = [...MECHANIC_GROUPS, OTHER_GROUP, SECRETS_GROUP];
  return order
    .map((group) => ({
      group,
      items: sections
        .filter((s) => groupOf(s).id === group.id)
        .sort((a, b) => {
          const ai = group.slugs.indexOf(a.slug);
          const bi = group.slugs.indexOf(b.slug);
          return ai !== bi ? ai - bi : a.order - b.order;
        }),
    }))
    .filter((g) => g.items.length > 0);
}

export function entryIcon(section: MechanicSectionMeta): string {
  return ENTRY_ICON[section.slug] ?? groupOf(section).icon;
}

export function splitLead(
  slug: string,
  description: string,
): { before: string; lead: string; after: string } | null {
  const lead = ENTRY_LEAD[slug];
  const at = lead ? description.indexOf(lead) : -1;
  if (!lead || at < 0) return null;
  return {
    before: description.slice(0, at),
    lead,
    after: description.slice(at + lead.length),
  };
}

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function bodyHeadings(body: string): { id: string; text: string }[] {
  const seen = new Set<string>();
  const out: { id: string; text: string }[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.trimStart().startsWith("```")) fenced = !fenced;
    if (fenced) continue;
    const m = /^## +(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/[`*_]/g, "");
    const id = headingId(text);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text });
  }
  return out;
}
