/**
 * Entity-detail redirect helpers, used by every `<entity>/[id]/page.tsx`
 * route to send unknown IDs back to a sensible parent hub instead of
 * 404'ing.
 *
 * Why this exists: Google Search Console reports thousands of 404s for
 * stale crawl URLs (renamed cards, old monster IDs, etc). A 404 dumps
 * link equity on the floor; a 308 hands the equity over to the parent
 * hub page and gives the user something useful to land on. We do this
 * on the *server* via `redirect()` so search engines see a real
 * HTTP-level redirect, not a soft-404.
 *
 * Some entity types don't have a list page of their own, they're
 * surfaced through `/reference` (acts, ascensions, intents, orbs,
 * afflictions, modifiers, achievements). Those redirect there.
 *
 * Tier 2 (renames / legacy paths): the legacy-ID map below is empty
 * for now because we don't have a documented set of historical IDs.
 * When we do an ID rename, add the entry here and unknown-ID requests
 * for the old slug will 308 to the new slug *before* falling through
 * to the parent-hub redirect.
 */

import { notFound, permanentRedirect } from "next/navigation";

export type EntityKind =
  | "cards"
  | "relics"
  | "monsters"
  | "potions"
  | "powers"
  | "events"
  | "encounters"
  | "keywords"
  | "characters"
  | "enchantments"
  | "guides"
  | "mechanics"
  | "badges"
  | "timeline"
  // Entity types without their own /<entity> list page,
  // these all surface through /reference instead.
  | "orbs"
  | "afflictions"
  | "intents"
  | "modifiers"
  | "achievements"
  | "acts"
  | "ascensions";

/**
 * Where to send a user when they hit `/<entity>/<unknown-id>`.
 *
 * For entity types with a list page, send them to that list page so
 * they can browse what *does* exist. For entity types without a list
 * page (orbs / afflictions / intents / etc.) send them to `/reference`
 * which is the umbrella hub the navbar links to.
 */
const PARENT_PATH: Record<EntityKind, string> = {
  cards: "/cards",
  relics: "/relics",
  monsters: "/monsters",
  potions: "/potions",
  powers: "/powers",
  events: "/events",
  encounters: "/encounters",
  keywords: "/keywords",
  characters: "/characters",
  enchantments: "/enchantments",
  guides: "/guides",
  mechanics: "/mechanics",
  badges: "/badges",
  timeline: "/timeline",
  orbs: "/reference",
  afflictions: "/reference",
  intents: "/reference",
  modifiers: "/modifiers",
  achievements: "/reference",
  acts: "/reference",
  ascensions: "/reference",
};

/**
 * Legacy ID → current ID map. Keyed by entity, then old slug → new
 * slug. Entries here generate a 308 (permanent) redirect that
 * preserves link equity through the rename.
 *
 * Empty by default, we don't have a documented rename history yet.
 * Wire renames in here when they happen.
 */
const LEGACY_IDS: Partial<Record<EntityKind, Record<string, string>>> = {
  // cards: { OLD_ID: "new_id" },
};

/**
 * What to do with an entity detail URL whose ID the API does not know.
 *
 * A documented rename gets a 308 to the new ID, locale prefix preserved,
 * so the old URL's authority moves with it. Anything else is a real 404:
 * redirecting an unknown ID to the category hub was recorded by Google as
 * a Soft 404 on the original URL, which is worse for the index than an
 * honest not-found and made transient API failures look like removals.
 *
 * Only call this after a definitive 404 from the API; `fetchEntityRes`
 * throws on every other failure so a sick backend never reaches here.
 * Server Components / route handlers only: both calls throw an internal
 * error Next intercepts.
 */
export function redirectMissingEntity(
  entity: EntityKind,
  id: string,
  lang?: string,
): never {
  const renamed = LEGACY_IDS[entity]?.[id];
  if (renamed) {
    const prefix = lang ? `/${lang}` : "";
    permanentRedirect(`${prefix}/${entity}/${renamed}`);
  }
  notFound();
}

