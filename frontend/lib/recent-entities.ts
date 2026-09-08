// "Jump back in" — a small localStorage-backed list of the compendium entities
// the visitor has recently opened, surfaced in the Compendium mega menu. Pure
// client-side; nothing is sent anywhere.

import { cachedFetch } from "./fetch-cache";

export type RecentEntity = { type: string; id: string; names?: Record<string, string> };

const KEY = "sc-recent-entities";
const MAX = 12;
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_PATH: Record<string, string> = { timeline: "epochs" };

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
    const list: RecentEntity[] = raw ? JSON.parse(raw) : [];
    const prev = list.find((e) => e.type === type && e.id === id);
    const rest = list.filter((e) => !(e.type === type && e.id === id));
    rest.unshift({ type, id, ...(prev?.names ? { names: prev.names } : {}) });
    localStorage.setItem(KEY, JSON.stringify(rest.slice(0, MAX)));
  } catch {
    /* storage disabled / quota */
  }
}

export function rememberRecentName(type: string, id: string, lang: string, name: string): void {
  try {
    const raw = localStorage.getItem(KEY);
    const list: RecentEntity[] = raw ? JSON.parse(raw) : [];
    const entry = list.find((e) => e.type === type && e.id === id);
    if (!entry) return;
    entry.names = { ...(entry.names ?? {}), [lang]: name };
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage disabled / quota */
  }
}

/** The entity's display name in `lang`, from the same detail endpoint its page reads. */
export function fetchRecentName(type: string, id: string, lang: string): Promise<string | null> {
  const path = API_PATH[type] ?? type;
  return cachedFetch<{ name?: string; title?: string }>(`${API}/api/${path}/${id}?lang=${lang}`)
    .then((d) => d?.name || d?.title || null)
    .catch(() => null);
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
