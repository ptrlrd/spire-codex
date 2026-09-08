import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates, localizedPath, hreflangOf as hreflangOfShared, ogLocaleOf as ogLocaleOfShared } from "./seo";
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
export const localePath = localizedPath;

export const hreflangOf = hreflangOfShared;

/** Open Graph `og:locale` for this locale (language_TERRITORY). */
export const ogLocaleOf = ogLocaleOfShared;

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

