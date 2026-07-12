// "Jump back in" — a small localStorage-backed list of the compendium entities
// the visitor has recently opened, surfaced in the Compendium mega menu. Pure
// client-side; nothing is sent anywhere.

export type RecentEntity = { type: string; id: string };

const KEY = "sc-recent-entities";
const MAX = 12;

/** Singular display label per entity route, and the set of routes that count. */
export const ENTITY_SINGULAR: Record<string, string> = {
  cards: "Card",
  relics: "Relic",
  potions: "Potion",
  powers: "Power",
  monsters: "Monster",
  encounters: "Encounter",
  events: "Event",
  enchantments: "Enchantment",
  orbs: "Orb",
  keywords: "Keyword",
  afflictions: "Affliction",
  intents: "Intent",
  modifiers: "Modifier",
  characters: "Character",
  acts: "Act",
  ascensions: "Ascension",
  achievements: "Achievement",
  badges: "Badge",
  timeline: "Epoch",
};

const RECENT_TYPES = new Set(Object.keys(ENTITY_SINGULAR));

export function isRecentType(type: string): boolean {
  return RECENT_TYPES.has(type);
}

/** id -> readable name ("blade_dance" -> "Blade Dance"). */
export function prettyRecentName(id: string): string {
  return decodeURIComponent(id)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function recordRecent(type: string, id: string): void {
  if (!isRecentType(type) || !id) return;
  try {
    const raw = localStorage.getItem(KEY);
    let list: RecentEntity[] = raw ? JSON.parse(raw) : [];
    list = list.filter((e) => !(e.type === type && e.id === id));
    list.unshift({ type, id });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage disabled / quota */
  }
}

export function getRecent(): RecentEntity[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentEntity[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
