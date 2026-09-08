/**
 * What an entity detail route does with an ID the API does not know.
 *
 * A documented rename (LEGACY_IDS) gets a 308 to the new ID so the old
 * URL's authority moves with it. Everything else is a real 404: redirecting
 * unknown IDs to the category hub was recorded by Google as a Soft 404 on
 * the original URL, which is worse for the index than an honest not-found
 * and made transient API failures look like removals.
 */

import { notFound, permanentRedirect } from "next/navigation";
import { localizedPath } from "./seo";
import type { Locale } from "@/i18n/routing";

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

/**
 * Legacy ID → current ID map. Keyed by entity, then old slug → new
 * slug. Entries here generate a 308 (permanent) redirect that
 * preserves link equity through the rename.
 *
 * Empty by default, we don't have a documented rename history yet.
 * Wire renames in here when they happen.
 */
export type LegacyIdMap = Partial<Record<EntityKind, Record<string, string>>>;

const LEGACY_IDS: LegacyIdMap = {
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
  locale: Locale = "eng",
  legacy: LegacyIdMap = LEGACY_IDS,
): never {
  const renamed = legacy[entity]?.[id];
  if (renamed) permanentRedirect(localizedPath(locale, `/${entity}/${renamed}`));
  notFound();
}

