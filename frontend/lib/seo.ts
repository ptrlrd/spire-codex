import type { Metadata } from "next";
import { SUPPORTED_LANGS, LANG_HREFLANG, LANG_GAME_NAME, LANG_NAMES, LANG_OG_LOCALE } from "./languages";
import type { Locale } from "@/i18n/routing";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
export const SITE_NAME = "Spire Codex";
// Default social card for all non-home pages. The black-background
// silent logo composition reads as a self-contained brand asset on any
// surface (Twitter, Discord, FB) and replaces the older
// `og-image.png` which is left in `public/` for backwards-compat with
// any external links already pointing at it.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/spire-codex-white-silent-black-background.png`;

// Bare-logo asset used on the home page only (transparent background,
// no decoration). Pages that want the bare logo instead of the branded
// composition import this directly.
export const HOME_OG_IMAGE = `${SITE_URL}/spire-codex-black-final.png`;

/**
 * Title suffixes. English keeps the long-standing "%s - Slay the Spire 2 (sts2) |
 * Spire Codex" shape; every other locale reads "<game name in that language>
 * %s | Spire Codex (<native language name>)".
 */
export const TITLE_TEMPLATE = `%s - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
export const TITLE_DEFAULT = `Database - Slay the Spire 2 (sts2) | ${SITE_NAME}`;

/** The game's name as the locale writes it. */
export function gameName(locale: Locale): string {
  return locale === "eng" ? "Slay the Spire 2 (sts2)" : LANG_GAME_NAME[locale];
}

/** `<title>` for a page from its own segment only ("Relics", "Bash - Card"). */
export function pageTitle(locale: Locale, segment: string): string {
  if (locale === "eng") return TITLE_TEMPLATE.replace("%s", () => segment);
  return `${LANG_GAME_NAME[locale]} ${segment} | ${SITE_NAME} (${LANG_NAMES[locale]})`;
}

/** The h1 for a hub page: the game name in the reader's language plus the page's own name. */
export function pageHeading(locale: Locale, segment: string): string {
  return `${gameName(locale)} ${segment}`;
}

export function hreflangOf(locale: Locale): string {
  return locale === "eng" ? "en" : LANG_HREFLANG[locale];
}

export function ogLocaleOf(locale: Locale): string {
  return locale === "eng" ? "en_US" : LANG_OG_LOCALE[locale];
}

/**
 * Build the `alternates.languages` map for a bare path, pointing to every
 * locale variant plus `x-default`. Bidirectional hreflang is what lets each
 * localized copy index on its own instead of competing with the English one.
 * The home page localizes to `/<code>`, never `/<code>/`: the trailing-slash
 * form 308s and hreflang must not point at a redirect.
 */
export function buildLanguageAlternates(path: string): Record<string, string> {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const map: Record<string, string> = {
    en: `${SITE_URL}${trimmed}`,
    "x-default": `${SITE_URL}${trimmed}`,
  };
  const suffix = trimmed === "/" ? "" : trimmed;
  for (const code of SUPPORTED_LANGS) {
    map[LANG_HREFLANG[code]] = `${SITE_URL}/${code}${suffix}`;
  }
  return map;
}

/** The URL path for `path` in this locale: bare for English, prefixed otherwise. The one implementation, shared by metadata and JSON-LD. */
export function localizedPath(locale: Locale, path: string): string {
  const bare = path.startsWith("/") ? path : `/${path}`;
  if (locale === "eng") return bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

export interface PageMetadataInput {
  locale: Locale;
  /** Bare path, never locale-prefixed: "/relics", "/cards/strike", "/". */
  path: string;
  /** This page's own segment, already translated ("Relics", "Bash - Card"). The helper adds the site suffix for the locale. */
  title: string;
  description?: string;
  ogType?: "website" | "article" | "profile";
  image?: string;
  /** Keep the page out of the index in every locale. */
  noIndex?: boolean;
  /** Canonical that lives elsewhere (a Steam article, the clean URL of a filtered view). Relative paths are fine. */
  canonical?: string;
  /** Set false on a page whose canonical points elsewhere: a page that is not its own canonical must not advertise hreflang. */
  hreflang?: boolean;
  /**
   * The page body is English-only content (guides, run shares): every locale
   * canonicalizes to the English URL, no hreflang is advertised, and the
   * non-English copies are noindex so readers keep their chrome language
   * without creating duplicates.
   */
  supressLanguageAlternates?: boolean;
}

/** Next `Metadata` for any page in any locale: title, description, Open Graph, Twitter, canonical, hreflang and robots from one call. */
export function buildPageMetadata({ locale, path, title, description, ogType, image, noIndex, canonical: canonicalOverride, hreflang, supressLanguageAlternates }: PageMetadataInput): Metadata {
  const canonical = canonicalOverride ?? localizedPath(supressLanguageAlternates ? "eng" : locale, path);
  const fullTitle = pageTitle(locale, title);
  const hidden = noIndex === true || (supressLanguageAlternates === true && locale !== "eng");
  const alternates = hreflang !== false && !hidden && !supressLanguageAlternates && !canonicalOverride;
  return {
    title: { absolute: fullTitle },
    description,
    openGraph: {
      title: fullTitle,
      description,
      url: canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`,
      type: ogType ?? "website",
      siteName: SITE_NAME,
      locale: ogLocaleOf(locale),
      images: [{ url: image ?? DEFAULT_OG_IMAGE }],
    },
    alternates: {
      canonical,
      languages: alternates ? buildLanguageAlternates(path) : undefined,
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, ...(image ? { images: [image] } : {}) },
    ...(hidden ? { robots: { index: false, follow: true } } : {}),
  };
}

export function stripTags(text: string): string {
  return text
    .replace(/\[energy:(\d+)\]/g, "$1 Energy")
    .replace(/\[star:(\d+)\]/g, "$1 Star")
    .replace(/\[\/?\w+(?:[=:][^\]]+)?\]/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Strip tags and collapse all newlines into a single line for meta descriptions. */
export function stripTagsFlat(text: string): string {
  return stripTags(text)
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Clip a meta-description-style string to Google's effective SERP
 * window (~160 chars). Truncates on a word boundary and appends an
 * ellipsis when the input overflows; passes short inputs through
 * unchanged. Use on detail-page `metadata.description` values so a
 * card with a long resolved description doesn't get cut mid-word in
 * Google search.
 */
export function clipMetaDescription(text: string, max = 160): string {
  if (!text) return text;
  const flat = text
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  // Reserve 1 char for the ellipsis we append. Slice to (max-1), then
  // back up to the previous word boundary so we don't truncate
  // mid-word.
  const sliced = flat.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced;
  return cut.replace(/[\s\p{P}]+$/u, "") + "…";
}
