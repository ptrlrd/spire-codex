/**
 * Language configuration for international SEO landing pages.
 * These are the 14 non-English languages supported by the game's localization
 * (zht shipped in game v0.109.0 with English fallback for untranslated strings).
 */

export const SUPPORTED_LANGS = [
  "eng",
  "deu",
  "esp",
  "fra",
  "ita",
  "jpn",
  "kor",
  "pol",
  "ptb",
  "rus",
  "spa",
  "tha",
  "tur",
  "zhs",
  "zht",
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number];

/**
 * URL-prefix membership test, shared by every consumer that parses a
 * /<lang>/... path (proxy.ts, nav, selector, fetch cache, lang prefix
 * hook). One source of truth: five separate hardcoded copies of this set
 * each silently missed zht when it shipped, which made the language
 * switcher append /zht onto already-prefixed paths.
 */
export const LANG_PREFIXES: ReadonlySet<string> = new Set(SUPPORTED_LANGS);

/** Maps 3-letter game codes to BCP-47 / hreflang codes */
export const LANG_HREFLANG: Record<LangCode, string> = {
  eng: "en",
  deu: "de",
  esp: "es-ES",
  fra: "fr",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  pol: "pl",
  ptb: "pt-BR",
  rus: "ru",
  // Generic "es" on purpose: the LatAm variant is the catch-all Spanish
  // (Spain gets the explicit es-ES above). The old es-419 region code is
  // valid per BCP 47 and Google, but most SEO crawlers only accept ISO
  // country codes and flagged every page for it.
  spa: "es",
  tha: "th",
  tur: "tr",
  zhs: "zh-Hans",
  zht: "zh-Hant",
};

/** Human-readable native language names */
export const LANG_NAMES: Record<LangCode, string> = {
  eng: "English",
  deu: "Deutsch",
  esp: "Espanol (ES)",
  fra: "Francais",
  ita: "Italiano",
  jpn: "日本語",
  kor: "한국어",
  pol: "Polski",
  ptb: "Portugues (BR)",
  rus: "Русский",
  spa: "Espanol (LA)",
  tha: "ไทย",
  tur: "Turkce",
  zhs: "简体中文",
  zht: "繁體中文",
};

/**
 * Localized "Slay the Spire 2" game name. Includes "(STS2)" inline
 * because the abbreviation is universal, players across every locale
 * type "sts2" into Google. Threaded through every [lang] page's title,
 * meta description, JSON-LD, and H1 via the `gameName` variable, so
 * this single source ships the abbreviation to all 52+ localized pages.
 */
export const LANG_GAME_NAME: Record<LangCode, string> = {
  eng: "Slay the Spire 2 (STS2)",
  deu: "Slay the Spire 2 (STS2)",
  esp: "Slay the Spire 2 (STS2)",
  fra: "Slay the Spire 2 (STS2)",
  ita: "Slay the Spire 2 (STS2)",
  jpn: "スレイ・ザ・スパイア2 (STS2)",
  kor: "슬레이 더 스파이어 2 (STS2)",
  pol: "Slay the Spire 2 (STS2)",
  ptb: "Slay the Spire 2 (STS2)",
  rus: "Slay the Spire 2 (STS2)",
  spa: "Slay the Spire 2 (STS2)",
  tha: "Slay the Spire 2 (STS2)",
  tur: "Slay the Spire 2 (STS2)",
  zhs: "杀戮尖塔2 (STS2)",
  zht: "殺戮尖塔2 (STS2)",
};

/** Localized "Database" for title/descriptions */
export const LANG_DATABASE: Record<LangCode, string> = {
  eng: "Database",
  deu: "Datenbank",
  esp: "Base de datos",
  fra: "Base de donnees",
  ita: "Database",
  jpn: "データベース",
  kor: "데이터베이스",
  pol: "Baza danych",
  ptb: "Banco de dados",
  rus: "База данных",
  spa: "Base de datos",
  tha: "ฐานข้อมูล",
  tur: "Veritabani",
  zhs: "数据库",
  zht: "資料庫",
};

/** Localized "Cards" label */
export const LANG_CARDS: Record<LangCode, string> = {
  eng: "Cards",
  deu: "Karten",
  esp: "Cartas",
  fra: "Cartes",
  ita: "Carte",
  jpn: "カード",
  kor: "카드",
  pol: "Karty",
  ptb: "Cartas",
  rus: "Карты",
  spa: "Cartas",
  tha: "การ์ด",
  tur: "Kartlar",
  zhs: "卡牌",
  zht: "卡牌",
};

/** Localized "Relics" label */
export const LANG_RELICS: Record<LangCode, string> = {
  eng: "Relics",
  deu: "Relikte",
  esp: "Reliquias",
  fra: "Reliques",
  ita: "Reliquie",
  jpn: "レリック",
  kor: "유물",
  pol: "Relikty",
  ptb: "Reliquias",
  rus: "Реликвии",
  spa: "Reliquias",
  tha: "เรลิก",
  tur: "Kalintilari",
  zhs: "遗物",
  zht: "遺物",
};

export function isValidLang(lang: string): lang is LangCode {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}

export function getLangOrDefault(lang?: string): LangCode {
  return lang && isValidLang(lang) ? lang : "eng";
}
