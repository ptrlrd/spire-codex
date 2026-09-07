import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "./seo";
import type { Locale } from "@/i18n/routing";
import { LANG_GAME_NAME, LANG_HREFLANG, LANG_NAMES, LANG_OG_LOCALE, SUPPORTED_LANGS } from "./languages";
import { messagesFor } from "@/i18n/messages";
import { safeKey } from "./i18n-keys";

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

/** The UI string for `key` in this locale, for server code that cannot await getT() (metadata helpers, JSON-LD). */
export function uiText(locale: Locale, key: string): string {
  const hit = messagesFor(locale)[safeKey(key)];
  return hit ? hit.replace(/''/g, "'") : key;
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

/** Title for a localized entity page: "<game> <name> - Relic | Spire Codex (日本語)". */
export function entityTitle(locale: Locale, name: string, kind: string): string {
  return `${gameNameFor(locale)} ${name} - ${uiText(locale, kind)} | Spire Codex${nativeNameSuffix(locale)}`;
}

function kindText(locale: Locale, kind: string): string {
  const capital = kind.charAt(0).toUpperCase() + kind.slice(1);
  const hit = uiText(locale, capital);
  return hit === capital ? kind : hit;
}

/** Meta description for a localized entity page, built around the localized description. */
export function entityDescription(locale: Locale, name: string, kind: string, desc: string): string {
  const text = `${gameNameFor(locale)} ${kindText(locale, kind)}, ${name}${desc ? `: ${desc}` : ""}`;
  return text.length > 155 ? `${text.slice(0, 152).trimEnd()}...` : text;
}

/** JSON-LD description when the entity has none: English keeps the old phrasing, other locales use the localized kind. */
export function entityFallbackDescription(locale: Locale, name: string, kind: string): string {
  if (locale === "eng") return `${name} ${kind} from Slay the Spire 2`;
  return `${gameNameFor(locale)} ${kindText(locale, kind)}, ${name}`;
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
