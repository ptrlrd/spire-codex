import type { MetadataRoute } from "next";
import { ALL_BROWSE_SLUGS } from "./cards/browse/slug-map";
import { SUPPORTED_LANGS } from "@/lib/languages";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

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
  { path: "/compare", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/showcase", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/developers", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/images", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" as const },
  { path: "/about", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/mechanics", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/guides", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/guides/submit", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/cards/browse", priority: 0.8, changeFrequency: "daily" as const },
];

interface EntityWithImage {
  id: string;
  name?: string;
  image_url?: string | null;
}

const DYNAMIC_ROUTES = [
  { endpoint: "/api/cards", prefix: "/cards", priority: 0.8 },
  { endpoint: "/api/characters", prefix: "/characters", priority: 0.9 },
  { endpoint: "/api/relics", prefix: "/relics", priority: 0.8 },
  { endpoint: "/api/monsters", prefix: "/monsters", priority: 0.7 },
  { endpoint: "/api/potions", prefix: "/potions", priority: 0.7 },
  { endpoint: "/api/enchantments", prefix: "/enchantments", priority: 0.6 },
  { endpoint: "/api/encounters", prefix: "/encounters", priority: 0.6 },
  { endpoint: "/api/powers", prefix: "/powers", priority: 0.6 },
  { endpoint: "/api/events", prefix: "/events", priority: 0.6 },
  { endpoint: "/api/keywords", prefix: "/keywords", priority: 0.7 },
  { endpoint: "/api/glossary", prefix: "/keywords", priority: 0.6 },
  { endpoint: "/api/acts", prefix: "/acts", priority: 0.6 },
  { endpoint: "/api/ascensions", prefix: "/ascensions", priority: 0.5 },
  { endpoint: "/api/intents", prefix: "/intents", priority: 0.5 },
  { endpoint: "/api/orbs", prefix: "/orbs", priority: 0.5 },
  { endpoint: "/api/afflictions", prefix: "/afflictions", priority: 0.5 },
  { endpoint: "/api/modifiers", prefix: "/modifiers", priority: 0.5 },
  { endpoint: "/api/achievements", prefix: "/achievements", priority: 0.5 },
  { endpoint: "/api/epochs", prefix: "/timeline", priority: 0.5 },
  { endpoint: "/api/guides", prefix: "/guides", priority: 0.6 },
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  const dynamicResults = await Promise.all(
    DYNAMIC_ROUTES.map(async (route) => {
      const entities = await fetchEntities(route.endpoint);
      return entities.map((entity) => {
        const entry: MetadataRoute.Sitemap[number] = {
          url: `${SITE_URL}${route.prefix}/${entity.id.toLowerCase()}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: route.priority,
        };

        if (entity.image_url) {
          entry.images = [`${API_PUBLIC}${entity.image_url}`];
        }

        return entry;
      });
    })
  );

  // Mechanics detail pages
  const { MECHANIC_SECTIONS } = await import("./mechanics/sections");
  const mechanicsEntries: MetadataRoute.Sitemap = MECHANIC_SECTIONS.map((s) => ({
    url: `${SITE_URL}/mechanics/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Card browse pages (programmatic SEO)
  const browseEntries: MetadataRoute.Sitemap = ALL_BROWSE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/cards/browse/${slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Localized pages: landing pages + list pages + detail pages
  const LANG_ENTITY_ROUTES = ["cards", "relics", "potions", "monsters", "powers", "events", "characters", "enchantments", "encounters", "acts", "ascensions", "keywords", "intents", "orbs", "afflictions", "modifiers", "achievements"];
  const langListEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) => [
    {
      url: `${SITE_URL}/${lang}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    ...LANG_ENTITY_ROUTES.map((route) => ({
      url: `${SITE_URL}/${lang}/${route}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ]);

  // Localized detail pages: 13 langs × all entities from dynamic routes
  const allEntityIds = await Promise.all(
    DYNAMIC_ROUTES.map(async (route) => {
      const entities = await fetchEntities(route.endpoint);
      return entities.map((e) => ({ prefix: route.prefix, id: e.id.toLowerCase() }));
    })
  );
  const flatEntityIds = allEntityIds.flat();

  const langDetailEntries: MetadataRoute.Sitemap = SUPPORTED_LANGS.flatMap((lang) =>
    flatEntityIds.map((e) => ({
      url: `${SITE_URL}/${lang}${e.prefix}/${e.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    }))
  );

  return [...staticEntries, ...mechanicsEntries, ...browseEntries, ...langListEntries, ...langDetailEntries, ...dynamicResults.flat()];
}
