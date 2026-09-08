import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "./seo";
import type { Locale } from "@/i18n/routing";
import { LANG_GAME_NAME, LANG_HREFLANG, LANG_NAMES, LANG_OG_LOCALE, SUPPORTED_LANGS } from "./languages";

export type { Locale };

export const LOCALES: readonly Locale[] = ["eng", ...SUPPORTED_LANGS];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** `?lang=jpn` (or `&lang=jpn`) for the API; nothing for English. */
export function langQuery(locale: Locale, separator: "?" | "&" = "?"): string {
  return locale === "eng" ? "" : `${separator}lang=${locale}`;
}

/** The URL path for `path` in this locale: bare for English, prefixed otherwise. */
export function localePath(locale: Locale, path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  if (locale === "eng") return trimmed;
  return trimmed === "/" ? `/${locale}` : `/${locale}${trimmed}`;
}

export function hreflangOf(locale: Locale): string {
  return locale === "eng" ? "en" : LANG_HREFLANG[locale];
}

/** Open Graph `og:locale` for this locale (language_TERRITORY). */
export function ogLocaleOf(locale: Locale): string {
  return locale === "eng" ? "en_US" : LANG_OG_LOCALE[locale];
}

/** The game's name as the locale writes it; English keeps the site's own phrasing. */
export function gameNameFor(locale: Locale, english = "Slay the Spire 2 (sts2)"): string {
  return locale === "eng" ? english : LANG_GAME_NAME[locale];
}

/** The native language name, for titles like "| Spire Codex (日本語)"; empty for English. */
export function nativeNameSuffix(locale: Locale): string {
  return locale === "eng" ? "" : ` (${LANG_NAMES[locale]})`;
}

/** The locale segment as a Locale; invalid values fall back to English (the layout 404s them). */
export function localeOf(value: string): Locale {
  return isLocale(value) ? value : "eng";
}

/** JSON-LD inLanguage for a localized page; English pages leave it unset. */
export function inLanguageOf(locale: Locale): string | undefined {
  return locale === "eng" ? undefined : LANG_HREFLANG[locale];
}

/** Metadata for a page that only exists in English: other locales point at the English URL and stay out of the index. */
export function englishOnlyMetadata(locale: Locale, path: string): Metadata {
  if (locale === "eng") return {};
  return { alternates: { canonical: path }, robots: { index: false, follow: true } };
}

/** Metadata for a list or hub page that exists in every locale: canonical on the locale's own URL, hreflang for all of them. */
export function listMetadata(
  locale: Locale,
  page: { path: string; title: string; description: string; image?: string; ogType?: "website" | "article" },
): Metadata {
  const url = localePath(locale, page.path);
  return {
    title: page.title,
    description: page.description,
    openGraph: {
      type: page.ogType ?? "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}${url}`,
      title: page.title,
      description: page.description,
      locale: ogLocaleOf(locale),
      images: [{ url: page.image ?? DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
    alternates: { canonical: url, languages: buildLanguageAlternates(page.path) },
  };
}
