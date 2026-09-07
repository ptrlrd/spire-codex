import type { MetadataRoute } from "next";
import { ALL_BROWSE_SLUGS } from "./cards/browse/slug-map";
import { SUPPORTED_LANGS } from "@/lib/languages";
import { imageUrl } from "@/lib/image-url";

// Regenerate at most every 30 minutes: crawler fetches between ticks are
// served from cache instead of re-running ~21 API list fetches each hit.
export const revalidate = 1800;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Locale-prefixed routes are only emitted when the route ACTUALLY exists
 * under `app/[lang]/`. Routes that have a list page (page.tsx) but no
 * detail folder, or vice versa, are tracked here so we don't ship 404s
 * to Google. Verified 2026-05-19 against `frontend/app/[lang]/` tree.
 *
 * Categories:
 *  - `LANG_LIST_ROUTES`, routes with `app/[lang]/{route}/page.tsx`
 *  - `LANG_DETAIL_ROUTES`, routes with `app/[lang]/{route}/[id]/page.tsx`
 *
 * The intersection gets both list + detail URLs in the sitemap; the
 * list-only entries get only the index page.
 *
 * Re-verified 2026-07-25 against the tree: added the hubs that had
 * landed since May (charts, community-stats, tier-list, mod, overlay,
 * knowledge-demon, giveaway, meta) plus modifiers, which always had a
 * localized list page but was only in the detail set. `/{lang}/runs`
 * stays out on purpose: it 308s to /runs.
 */
const LANG_LIST_ROUTES = [
  "cards",
  "relics",
  "potions",
  "monsters",
  "powers",
  "events",
  "characters",
  "enchantments",
  "encounters",
  "keywords",
  "badges",
  "timeline",
  "modifiers",
  // Static/hub pages that also have localized versions
  "ancients",
  "merchant",
  "unlocks",
  "mechanics",
  "guides",
  "news",
  "leaderboards",
  "tier-list",
  "charts",
  "community-stats",
  "compare",
  "changelog",
  "developers",
  "showcase",
  "reference",
  "images",
  "about",
  "mod",
  "exporter",
  "overlay",
  "knowledge-demon",
  "giveaway",
  "meta",
] as const;

// Routes with a working `app/[lang]/{route}/[id]/page.tsx` (or `[slug]`).
// Excludes timeline, no [id] folder under [lang]/timeline so localized
// epoch URLs 404. Includes acts/ascensions/intents/orbs/afflictions/
// modifiers/achievements even though their LIST pages don't exist under
// [lang]/ (those are handled separately in LANG_LIST_ROUTES); the detail
// pages render fine on their own.
const LANG_DETAIL_ROUTES = new Set([
  "cards",
  "relics",
  "potions",
  "monsters",
  "powers",
  "events",
  "characters",
  "enchantments",
  "encounters",
  "keywords",
  "badges",
  "acts",
  "ascensions",
  "intents",
  "orbs",
  "afflictions",
  "modifiers",
  "achievements",
  // app/[lang]/guides/[slug]/page.tsx exists; localized guide URLs were
  // never emitted even though the pages render.
  "guides",
]);

const STATIC_PAGES = [
  { path: "/", priority: 1.0, changeFrequency: "daily" as const },
  { path: "/cards", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/keywords", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/characters", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/relics", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/monsters", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/potions", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/powers", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/enchantments", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/encounters", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/events", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/timeline", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/reference", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/merchant", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/ancients", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/modifiers", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/leaderboards", priority: 0.7, changeFrequency: "daily" as const },
  { path: "/leaderboards/submit", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/leaderboards/stats", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/community-stats", priority: 0.7, changeFrequency: "daily" as const },
  { path: "/leaderboards/scoring", priority: 0.6, changeFrequency: "monthly" as const },
  // Tier list, high priority, daily changefreq because scores update
  // every 30 minutes as new runs arrive. Per-character variants are
  // crawled via the in-DOM filter <Link>s on /tier-list/cards.
  { path: "/tier-list", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/tier-list/cards", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/tier-list/relics", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/tier-list/potions", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/compare", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/showcase", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/developers", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/images", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" as const },
  { path: "/about", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/mechanics", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/guides", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/guides/submit", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/badges", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/cards/browse", priority: 0.8, changeFrequency: "daily" as const },
  // Top-level content sections that existed on the site but were
  // missing from the sitemap, fixed 2026-05-19.
  { path: "/news", priority: 0.7, changeFrequency: "daily" as const },
  { path: "/unlocks", priority: 0.6, changeFrequency: "weekly" as const },
];

interface EntityWithImage {
  id: string;
  name?: string;
  image_url?: string | null;
}

/**
 * Dynamic entity routes. `prefix` is the URL path; the `id.toLowerCase()`
 * is appended to form the detail URL. `localized` controls whether the
 * `/{lang}/{prefix}/{id}` variants are also emitted, this is gated by
 * whether the actual page file exists under `app/[lang]/`.
 */
const DYNAMIC_ROUTES = [
  { endpoint: "/api/cards", prefix: "/cards", priority: 0.8, localized: true },
  { endpoint: "/api/characters", prefix: "/characters", priority: 0.9, localized: true },
  { endpoint: "/api/relics", prefix: "/relics", priority: 0.8, localized: true },
  { endpoint: "/api/monsters", prefix: "/monsters", priority: 0.7, localized: true },
  { endpoint: "/api/potions", prefix: "/potions", priority: 0.7, localized: true },
  { endpoint: "/api/enchantments", prefix: "/enchantments", priority: 0.6, localized: true },
  { endpoint: "/api/encounters", prefix: "/encounters", priority: 0.6, localized: true },
  { endpoint: "/api/powers", prefix: "/powers", priority: 0.6, localized: true },
  { endpoint: "/api/events", prefix: "/events", priority: 0.6, localized: true },
  { endpoint: "/api/keywords", prefix: "/keywords", priority: 0.7, localized: true },
  { endpoint: "/api/glossary", prefix: "/keywords", priority: 0.6, localized: true },
  { endpoint: "/api/acts", prefix: "/acts", priority: 0.6, localized: true },
  { endpoint: "/api/ascensions", prefix: "/ascensions", priority: 0.5, localized: true },
  { endpoint: "/api/intents", prefix: "/intents", priority: 0.5, localized: true },
  { endpoint: "/api/orbs", prefix: "/orbs", priority: 0.5, localized: true },
  { endpoint: "/api/afflictions", prefix: "/afflictions", priority: 0.5, localized: true },
  { endpoint: "/api/modifiers", prefix: "/modifiers", priority: 0.5, localized: true },
  { endpoint: "/api/achievements", prefix: "/achievements", priority: 0.5, localized: true },
  { endpoint: "/api/badges", prefix: "/badges", priority: 0.5, localized: true },
  // /api/epochs renders at /timeline/{id}, works in English, but the
  // localized [lang]/timeline directory has no [id] folder, so we keep
  // these English-only.
  { endpoint: "/api/epochs", prefix: "/timeline", priority: 0.5, localized: false },
  { endpoint: "/api/guides", prefix: "/guides", priority: 0.6, localized: true },
];

// A failed list fetch throws instead of yielding an empty section: an empty
// section silently drops hundreds of URLs from the sitemap, and Next keeps
// serving the last good sitemap when a regeneration fails.
async function fetchEntities(endpoint: string): Promise<EntityWithImage[]> {
  const res = await fetch(`${API}${endpoint}`, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`sitemap: ${endpoint} returned ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`sitemap: ${endpoint} did not return a list`);
  return body as EntityWithImage[];
}

// The only truthful lastmod we have is the latest game-data changelog date,
// which is when entity pages last changed. Hub and community pages carry no
// lastmod: a synthetic "today" or "this hour" on every fetch tells Google
// the page changed when it didn't, and it stops trusting the field.
async function contentLastMod(): Promise<Date | undefined> {
  try {
    const res = await fetch(`${API}/api/changelogs`, { next: { revalidate: 1800 } });
    if (!res.ok) return undefined;
    const log = (await res.json()) as Array<{ date?: string }>;
    const latest = log.find((e) => e.date);
    if (!latest?.date) return undefined;
    const parsed = new Date(latest.date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  } catch {
    return undefined;
  }
}

// Ancient offer pools on the relic tier list, mirrored from ANCIENT_FILTERS in
// app/tier-list/relics/page.tsx. Each is its own canonical page and several
// rank on page one, so they are listed explicitly instead of left to crawl
// discovery; every other filter combination canonicalizes to one of these.
const TIER_RELIC_ANCIENTS = ["neow", "tezcatara", "pael", "orobas", "darv", "nonupeipe", "tanx", "vakuu"];
const TIER_RELIC_ACTS = ["1", "2", "3"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const contentDate = await contentLastMod();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // English entity detail pages, kept in a side bucket so we can reuse
  // the per-route entity list for the localized expansion below without
  // re-fetching.
  type FetchedRoute = (typeof DYNAMIC_ROUTES)[number] & { entities: EntityWithImage[] };
  const dynamicResults: FetchedRoute[] = await Promise.all(
    DYNAMIC_ROUTES.map(async (route) => ({
      ...route,
      entities: await fetchEntities(route.endpoint),
    }))
  );

  const englishDetailEntries: MetadataRoute.Sitemap = dynamicResults.flatMap((route) =>
    route.entities.map((entity) => {
      const entry: MetadataRoute.Sitemap[number] = {
        url: `${SITE_URL}${route.prefix}/${entity.id.toLowerCase()}`,
        lastModified: contentDate,
        changeFrequency: "weekly",
        priority: route.priority,
      };

      if (entity.image_url) {
        entry.images = [imageUrl(entity.image_url)];
      }

      return entry;
    })
  );

  // Mechanics detail pages, fetched from /api/mechanics/sections so
  // adding/removing a slug only requires a markdown file in
  // data/mechanics_pages/, no sitemap edit.
  type MechanicSectionMeta = { slug: string };
  const mechanicsRes = await fetch(`${API}/api/mechanics/sections`, {
    next: { revalidate: 300 },
  }).catch(() => null);
  const mechanicSections: MechanicSectionMeta[] = mechanicsRes && mechanicsRes.ok
    ? ((await mechanicsRes.json()) as MechanicSectionMeta[])
    : [];
  const mechanicsEntries: MetadataRoute.Sitemap = mechanicSections.map((s) => ({
    url: `${SITE_URL}/mechanics/${s.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // News detail pages canonical-link back to Steam (see
  // news/[...slug]/page.tsx), and a sitemap must only list canonical URLs —
  // crawlers flag non-canonical entries. The /news list page stays; the
  // articles are reachable from it.

  // Tier list filter variants, each is its own indexable URL with
  // its own generateMetadata title + canonical, so they need their
  // own sitemap entries to surface in search. Targets long-tail
  // queries like "ironclad tier list", "necrobinder relic tier list".
  const TIER_CARD_COLORS = ["ironclad", "silent", "defect", "necrobinder", "regent", "colorless"];
  const TIER_RELIC_POOLS = ["shared", "ironclad", "silent", "defect", "necrobinder", "regent"];
  const tierListVariants: MetadataRoute.Sitemap = [
    ...TIER_CARD_COLORS.map((c) => ({
      url: `${SITE_URL}/tier-list/cards?color=${c}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...TIER_RELIC_POOLS.map((p) => ({
      url: `${SITE_URL}/tier-list/relics?pool=${p}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...TIER_RELIC_ACTS.map((a) => ({
      url: `${SITE_URL}/tier-list/relics?act=${a}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...TIER_RELIC_ANCIENTS.map((a) => ({
      url: `${SITE_URL}/tier-list/relics?ancient=${a}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...TIER_RELIC_ACTS.flatMap((act) =>
      TIER_RELIC_ANCIENTS.map((a) => ({
        url: `${SITE_URL}/tier-list/relics?act=${act}&ancient=${a}`,
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
    ),
  ];

  // Card browse pages (programmatic SEO)
  const browseEntries: MetadataRoute.Sitemap = ALL_BROWSE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/cards/browse/${slug}`,
    lastModified: contentDate,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Localized list / hub pages: only emit routes that ACTUALLY exist
  // under `app/[lang]/`. Previously we expanded a hardcoded route list
  // that included `acts`, `ascensions`, `intents`, `orbs`, `afflictions`,
  // `modifiers`, `achievements`, none of which have a localized list
  // page, so all 91 of those URLs 404'd. Removed 2026-05-19.
  const langListEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) => [
    {
      url: `${SITE_URL}/${lang}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    ...LANG_LIST_ROUTES.map((route) => ({
      url: `${SITE_URL}/${lang}/${route}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ]);

  // Localized mechanics detail pages, page.tsx lives at
  // `app/[lang]/mechanics/[slug]/page.tsx`, so each slug × each lang
  // is a real URL.
  const langMechanicsEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) =>
    mechanicSections.map((s) => ({
      url: `${SITE_URL}/${lang}/mechanics/${s.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }))
  );

  // Localized entity detail pages, only for routes that have a real
  // [id]/page.tsx under `app/[lang]/`. Previously this expanded ALL
  // DYNAMIC_ROUTES including timeline/acts/etc, producing 13 × 57 = 741
  // dead `/{lang}/timeline/{epoch}` URLs and similar.
  const localizedDynamicRoutes = dynamicResults.filter(
    (r) => r.localized && LANG_DETAIL_ROUTES.has(r.prefix.replace(/^\//, ""))
  );
  const langDetailEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) =>
    localizedDynamicRoutes.flatMap((route) =>
      route.entities.map((entity) => ({
        url: `${SITE_URL}/${lang}${route.prefix}/${entity.id.toLowerCase()}`,
        lastModified: contentDate,
        changeFrequency: "weekly" as const,
        priority: 0.4,
      }))
    )
  );

  const seen = new Set<string>();
  return [
    ...staticEntries,
    ...mechanicsEntries,
    ...tierListVariants,
    ...browseEntries,
    ...langListEntries,
    ...langMechanicsEntries,
    ...langDetailEntries,
    ...englishDetailEntries,
  ].filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
