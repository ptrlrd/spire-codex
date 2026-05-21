import type { MetadataRoute } from "next";
import { ALL_BROWSE_SLUGS } from "./cards/browse/slug-map";
import { SUPPORTED_LANGS } from "@/lib/languages";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Locale-prefixed routes are only emitted when the route ACTUALLY exists
 * under `app/[lang]/`. Routes that have a list page (page.tsx) but no
 * detail folder, or vice versa, are tracked here so we don't ship 404s
 * to Google. Verified 2026-05-19 against `frontend/app/[lang]/` tree.
 *
 * Categories:
 *  - `LANG_LIST_ROUTES` — routes with `app/[lang]/{route}/page.tsx`
 *  - `LANG_DETAIL_ROUTES` — routes with `app/[lang]/{route}/[id]/page.tsx`
 *
 * The intersection gets both list + detail URLs in the sitemap; the
 * list-only entries get only the index page.
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
  // Static/hub pages that also have localized versions
  "ancients",
  "merchant",
  "unlocks",
  "mechanics",
  "guides",
  "news",
  "leaderboards",
  "compare",
  "changelog",
  "developers",
  "showcase",
  "reference",
  "images",
  "about",
] as const;

// Routes with a working `app/[lang]/{route}/[id]/page.tsx` (or `[slug]`).
// Excludes timeline — no [id] folder under [lang]/timeline so localized
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
  { path: "/leaderboards/scoring", priority: 0.6, changeFrequency: "monthly" as const },
  // Tier list — high priority, daily changefreq because scores update
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
  // missing from the sitemap — fixed 2026-05-19.
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
 * `/{lang}/{prefix}/{id}` variants are also emitted — this is gated by
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
  // /api/epochs renders at /timeline/{id} — works in English, but the
  // localized [lang]/timeline directory has no [id] folder, so we keep
  // these English-only.
  { endpoint: "/api/epochs", prefix: "/timeline", priority: 0.5, localized: false },
  { endpoint: "/api/guides", prefix: "/guides", priority: 0.6, localized: true },
];

async function fetchEntities(endpoint: string): Promise<EntityWithImage[]> {
  try {
    const res = await fetch(`${API}${endpoint}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Per-section freshness signal. Different content updates at different
 * cadences — slamming every URL with the same `now` timestamp on every
 * sitemap fetch defeats `lastmod`'s purpose (Google deprioritizes URLs
 * whose timestamp never changes). We bucket lastmod by content type
 * and pull a real signal from `/api/changelogs` for entity content.
 */
async function getLastModBuckets(now: Date): Promise<{
  content: Date; // entity data — last game patch / data parse
  community: Date; // runs, leaderboards — refresh roughly hourly
  static: Date; // hub pages, dev docs — week-stable
}> {
  // Default fallbacks if the backend is unreachable (frontend build under
  // network-isolated CI shouldn't hard-fail the sitemap).
  let contentDate = new Date(now);
  contentDate.setUTCHours(0, 0, 0, 0);
  const staticDate = new Date(contentDate);

  try {
    const res = await fetch(`${API}/api/changelogs`, { next: { revalidate: 1800 } });
    if (res.ok) {
      const log = (await res.json()) as Array<{ date?: string }>;
      // Most recent entry first per /api/changelogs ordering.
      const latest = log.find((e) => e.date);
      if (latest?.date) {
        const parsed = new Date(latest.date);
        if (!Number.isNaN(parsed.getTime())) {
          contentDate = parsed;
        }
      }
    }
  } catch {
    // keep fallback
  }

  // Community pages tick more often — bucket to the hour so we get a
  // moving lastmod without burning crawl budget on every-minute changes.
  const community = new Date(now);
  community.setUTCMinutes(0, 0, 0);

  return { content: contentDate, community, static: staticDate };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const lastMod = await getLastModBuckets(now);

  const COMMUNITY_PATHS = new Set([
    "/leaderboards",
    "/leaderboards/submit",
    "/leaderboards/stats",
    "/leaderboards/scoring",
    "/tier-list",
    "/tier-list/cards",
    "/tier-list/relics",
    "/tier-list/potions",
    "/news",
  ]);

  const pickLastMod = (path: string): Date => {
    if (COMMUNITY_PATHS.has(path)) return lastMod.community;
    return lastMod.static;
  };

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: pickLastMod(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // English entity detail pages — kept in a side bucket so we can reuse
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
        lastModified: lastMod.content,
        changeFrequency: "weekly",
        priority: route.priority,
      };

      if (entity.image_url) {
        entry.images = [`${API_PUBLIC}${entity.image_url}`];
      }

      return entry;
    })
  );

  // Mechanics detail pages — fetched from /api/mechanics/sections so
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
    lastModified: lastMod.static,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // News detail pages — pull recent gids from /api/news. Articles
  // canonical-link back to Steam (see `news/[...slug]/page.tsx`) so
  // they're additive for "Slay the Spire 2 news"-style queries.
  type NewsItem = { gid: string; date?: number };
  type NewsResponse = { items?: NewsItem[] };
  const newsRes = await fetch(`${API}/api/news?limit=500`, {
    next: { revalidate: 1800 },
  }).catch(() => null);
  const newsItems: NewsItem[] =
    newsRes && newsRes.ok ? ((await newsRes.json()) as NewsResponse).items ?? [] : [];
  const newsEntries: MetadataRoute.Sitemap = newsItems.map((n) => ({
    url: `${SITE_URL}/news/${n.gid}`,
    lastModified: n.date ? new Date(n.date * 1000) : lastMod.community,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  // Tier list filter variants — each is its own indexable URL with
  // its own generateMetadata title + canonical, so they need their
  // own sitemap entries to surface in search. Targets long-tail
  // queries like "ironclad tier list", "necrobinder relic tier list".
  const TIER_CARD_COLORS = ["ironclad", "silent", "defect", "necrobinder", "regent", "colorless"];
  const TIER_RELIC_POOLS = ["shared", "ironclad", "silent", "defect", "necrobinder", "regent"];
  const tierListVariants: MetadataRoute.Sitemap = [
    ...TIER_CARD_COLORS.map((c) => ({
      url: `${SITE_URL}/tier-list/cards?color=${c}`,
      lastModified: lastMod.community,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...TIER_RELIC_POOLS.map((p) => ({
      url: `${SITE_URL}/tier-list/relics?pool=${p}`,
      lastModified: lastMod.community,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];

  // Card browse pages (programmatic SEO)
  const browseEntries: MetadataRoute.Sitemap = ALL_BROWSE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/cards/browse/${slug}`,
    lastModified: lastMod.content,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Localized list / hub pages: only emit routes that ACTUALLY exist
  // under `app/[lang]/`. Previously we expanded a hardcoded route list
  // that included `acts`, `ascensions`, `intents`, `orbs`, `afflictions`,
  // `modifiers`, `achievements` — none of which have a localized list
  // page, so all 91 of those URLs 404'd. Removed 2026-05-19.
  const langListEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) => [
    {
      url: `${SITE_URL}/${lang}`,
      lastModified: lastMod.static,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    ...LANG_LIST_ROUTES.map((route) => ({
      url: `${SITE_URL}/${lang}/${route}`,
      lastModified: lastMod.static,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ]);

  // Localized mechanics detail pages — page.tsx lives at
  // `app/[lang]/mechanics/[slug]/page.tsx`, so each slug × each lang
  // is a real URL.
  const langMechanicsEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) =>
    mechanicSections.map((s) => ({
      url: `${SITE_URL}/${lang}/mechanics/${s.slug}`,
      lastModified: lastMod.static,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }))
  );

  // Localized news article pages
  const langNewsEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) =>
    newsItems.map((n) => ({
      url: `${SITE_URL}/${lang}/news/${n.gid}`,
      lastModified: n.date ? new Date(n.date * 1000) : lastMod.community,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    }))
  );

  // Localized entity detail pages — only for routes that have a real
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
        lastModified: lastMod.content,
        changeFrequency: "weekly" as const,
        priority: 0.4,
      }))
    )
  );

  return [
    ...staticEntries,
    ...mechanicsEntries,
    ...newsEntries,
    ...tierListVariants,
    ...browseEntries,
    ...langListEntries,
    ...langMechanicsEntries,
    ...langNewsEntries,
    ...langDetailEntries,
    ...englishDetailEntries,
  ];
}
