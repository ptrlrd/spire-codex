import { langQuery } from "@/lib/locale";
import type { Locale } from "@/i18n/routing";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export interface CatalogEntry {
  id: string;
  name: string;
  description?: string;
}

export interface KeywordEntry {
  id: string;
  name: string;
  description: string;
}

export interface PowerEntry {
  id: string;
  name: string;
  description: string;
  type: string;
  image_url: string | null;
}

export interface RelicEntry {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
}

/** Fields of a spawned card needed for the description card-ref tooltips. */
export interface SpawnedCardEntry {
  id: string;
  name: string;
  image_url: string | null;
  type: string;
  rarity: string;
  cost: number;
}

/**
 * Best-effort catalog fetch feeding the description auto-links. Catalogs
 * are shared across every page render through the fetch cache (one request
 * per revalidate window per locale); a failed or empty catalog degrades to
 * no links, never a failed render.
 */
async function fetchCatalog<T>(path: string, locale: Locale): Promise<T[]> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/${path}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export const fetchKeywordCatalog = (locale: Locale) =>
  fetchCatalog<KeywordEntry>("keywords", locale);
export const fetchPowerCatalog = (locale: Locale) =>
  fetchCatalog<PowerEntry>("powers", locale);
export const fetchGlossaryCatalog = (locale: Locale) =>
  fetchCatalog<KeywordEntry>("glossary", locale);
export const fetchOrbCatalog = (locale: Locale) =>
  fetchCatalog<KeywordEntry>("orbs", locale);
export const fetchCardCatalog = (locale: Locale) =>
  fetchCatalog<CatalogEntry>("cards", locale);
export const fetchRelicCatalog = (locale: Locale) =>
  fetchCatalog<RelicEntry>("relics", locale);

/** Fetch the cards an entity spawns by id; missing ids drop out silently. */
export async function fetchSpawnedCards(
  ids: readonly string[],
  locale: Locale,
): Promise<SpawnedCardEntry[]> {
  const cards = await Promise.all(
    ids.map(async (sid) => {
      try {
        const res = await fetch(
          `${API_INTERNAL}/api/cards/${sid}${langQuery(locale)}`,
          { next: { revalidate: 3600 } },
        );
        if (!res.ok) return null;
        const card = await res.json();
        return {
          id: card.id,
          name: card.name,
          image_url: card.image_url,
          type: card.type,
          rarity: card.rarity,
          cost: card.cost,
        } satisfies SpawnedCardEntry;
      } catch {
        return null;
      }
    }),
  );
  return cards.filter((c) => c !== null);
}
