/**
 * Shared server component for localized entity detail pages.
 * Used by /{lang}/cards/[id], /{lang}/relics/[id], etc.
 *
 * Renders localized metadata + JSON-LD for SEO, and a server-rendered
 * detail view with localized content. Links back to the full English
 * detail page for the interactive experience.
 */
import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";
import { SITE_URL } from "@/lib/seo";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

interface EntityConfig {
  apiPath: string;        // e.g., "cards"
  category: string;       // e.g., "Card" (English, for JSON-LD)
  getCategoryLabel: (lang: LangCode) => string;  // Localized category label
  getSubtitle?: (entity: Record<string, unknown>) => string;
}

export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  cards: {
    apiPath: "cards",
    category: "Card",
    getCategoryLabel: () => "Card",
    getSubtitle: (e) => [e.type, e.rarity, e.color].filter(Boolean).join(" · "),
  },
  relics: {
    apiPath: "relics",
    category: "Relic",
    getCategoryLabel: () => "Relic",
    getSubtitle: (e) => [e.rarity, e.pool].filter(Boolean).join(" · "),
  },
  potions: {
    apiPath: "potions",
    category: "Potion",
    getCategoryLabel: () => "Potion",
    getSubtitle: (e) => [e.rarity].filter(Boolean).join(" · "),
  },
  monsters: {
    apiPath: "monsters",
    category: "Monster",
    getCategoryLabel: () => "Monster",
    getSubtitle: (e) => {
      const hp = e.min_hp ? `${e.min_hp}${e.max_hp && e.max_hp !== e.min_hp ? `–${e.max_hp}` : ""} HP` : "";
      return [e.type, hp].filter(Boolean).join(" · ");
    },
  },
  powers: {
    apiPath: "powers",
    category: "Power",
    getCategoryLabel: () => "Power",
    getSubtitle: (e) => [e.type, e.stack_type].filter(Boolean).join(" · "),
  },
  events: {
    apiPath: "events",
    category: "Event",
    getCategoryLabel: () => "Event",
    getSubtitle: (e) => [e.type, e.act].filter(Boolean).join(" · "),
  },
  characters: {
    apiPath: "characters",
    category: "Character",
    getCategoryLabel: () => "Character",
    getSubtitle: (e) => {
      const parts: string[] = [];
      if (e.starting_hp) parts.push(`${e.starting_hp} HP`);
      if (e.max_energy) parts.push(`${e.max_energy} Energy`);
      return parts.join(" · ");
    },
  },
};

async function fetchEntity(entityType: string, id: string, lang: string) {
  try {
    const config = ENTITY_CONFIGS[entityType];
    if (!config) return null;
    const res = await fetch(`${API}/api/${config.apiPath}/${id}?lang=${lang}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateLocalizedMetadata(
  entityType: string,
  lang: string,
  id: string,
): Promise<Metadata> {
  if (!isValidLang(lang)) return {};
  const config = ENTITY_CONFIGS[entityType];
  if (!config) return {};

  const entity = await fetchEntity(entityType, id, lang);
  if (!entity) return { title: "Not Found - Spire Codex" };

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const name = entity.name || entity.title || id;
  const desc = stripTags(entity.description || "");
  const title = `${gameName} ${name} - ${config.category} | Spire Codex (${LANG_NAMES[langCode]})`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/${entityType}/${id}`,
    "x-default": `${SITE_URL}/${entityType}/${id}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${entityType}/${id}`;
  }

  return {
    title,
    description: desc || `${name} - ${gameName}`,
    openGraph: {
      title,
      description: desc || `${name} - ${gameName}`,
      locale: LANG_HREFLANG[langCode],
      images: entity.image_url ? [{ url: `${API_PUBLIC}${entity.image_url}` }] : [],
    },
    twitter: { card: "summary_large_image" },
    alternates: {
      canonical: `/${lang}/${entityType}/${id}`,
      languages,
    },
  };
}

export async function LocalizedDetailPage({
  entityType,
  lang,
  id,
}: {
  entityType: string;
  lang: string;
  id: string;
}) {
  if (!isValidLang(lang)) return null;
  const config = ENTITY_CONFIGS[entityType];
  if (!config) return null;

  const entity = await fetchEntity(entityType, id, lang);
  if (!entity) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Not Found</h1>
        <Link href={`/${lang}`} className="text-[var(--accent-gold)]">
          &larr; Back
        </Link>
      </div>
    );
  }

  const langCode = lang as LangCode;
  const name = entity.name || entity.title || id;
  const desc = entity.description || "";
  const descClean = stripTags(desc);
  const subtitle = config.getSubtitle?.(entity) || "";
  const gameName = LANG_GAME_NAME[langCode];

  const jsonLd = [
    ...buildDetailPageJsonLd({
      name,
      description: descClean || `${name} - ${gameName}`,
      path: `/${lang}/${entityType}/${id}`,
      imageUrl: entity.image_url ? `${API_PUBLIC}${entity.image_url}` : undefined,
      category: config.category,
      breadcrumbs: [
        { name: "Home", href: `/${lang}` },
        { name: config.category, href: `/${lang}/${entityType === "characters" ? "characters" : entityType}` },
        { name, href: `/${lang}/${entityType}/${id}` },
      ],
    }),
    buildFAQPageJsonLd([
      { question: `${name}?`, answer: descClean || `${name} - ${gameName}` },
    ]),
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href={`/${lang}/${entityType}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {LANG_NAMES[langCode]}
      </Link>

      <div className="bg-[var(--bg-card)] rounded-2xl border-2 border-[var(--border-subtle)] shadow-2xl shadow-black/50 overflow-hidden">
        {/* Image */}
        {entity.image_url && (
          <div className="bg-black/40">
            <img
              src={`${API_PUBLIC}${entity.image_url}`}
              alt={`${name} - ${gameName}`}
              className="w-full object-contain max-h-80"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <div className="p-5 sm:p-6">
          {/* Name */}
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            {name}
          </h1>

          {/* Subtitle (type, rarity, etc.) */}
          {subtitle && (
            <div className="text-sm text-[var(--text-muted)] mb-4">
              {subtitle}
            </div>
          )}

          {/* Description */}
          {desc && (
            <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
              <RichDescription text={desc} />
            </div>
          )}

          {/* Card-specific stats */}
          {entityType === "cards" && entity.damage && (
            <div className="flex gap-3 mb-4">
              <span className="text-sm px-3 py-1 rounded border bg-red-950/50 text-red-300 border-red-900/30">
                {entity.damage}{entity.hit_count && entity.hit_count > 1 ? ` × ${entity.hit_count}` : ""} DMG
              </span>
              {entity.block && (
                <span className="text-sm px-3 py-1 rounded border bg-blue-950/50 text-blue-300 border-blue-900/30">
                  {entity.block} BLK
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
