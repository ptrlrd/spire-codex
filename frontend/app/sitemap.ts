import type { MetadataRoute } from "next";

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
  { path: "/compare", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/developers", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/images", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" as const },
  { path: "/about", priority: 0.4, changeFrequency: "monthly" as const },
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
  { endpoint: "/api/powers", prefix: "/powers", priority: 0.6 },
  { endpoint: "/api/events", prefix: "/events", priority: 0.6 },
  { endpoint: "/api/keywords", prefix: "/keywords", priority: 0.7 },
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

  return [...staticEntries, ...dynamicResults.flat()];
}
