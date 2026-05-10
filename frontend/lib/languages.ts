/**
 * Language configuration for international SEO landing pages.
 * These are the 13 non-English languages supported by the game's localization.
 */

export const SUPPORTED_LANGS = [
  "deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs",
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number];

/** Maps 3-letter game codes to BCP-47 / hreflang codes */
export const LANG_HREFLANG: Record<LangCode, string> = {
  deu: "de",
  esp: "es",
  fra: "fr",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  pol: "pl",
  ptb: "pt-BR",
  rus: "ru",
  spa: "es-419",
  tha: "th",
  tur: "tr",
  zhs: "zh-Hans",
};

/** Human-readable native language names */
export const LANG_NAMES: Record<LangCode, string> = {
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
};

/**
 * Localized "Slay the Spire 2" game name. Includes "(STS2)" inline
 * because the abbreviation is universal — players across every locale
 * type "sts2" into Google. Threaded through every [lang] page's title,
 * meta description, JSON-LD, and H1 via the `gameName` variable, so
 * this single source ships the abbreviation to all 52+ localized pages.
 */
export const LANG_GAME_NAME: Record<LangCode, string> = {
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
};

/** Localized "Database" for title/descriptions */
export const LANG_DATABASE: Record<LangCode, string> = {
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
};

/** Localized "Cards" label */
export const LANG_CARDS: Record<LangCode, string> = {
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
};

/** Localized "Relics" label */
export const LANG_RELICS: Record<LangCode, string> = {
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
};

export function isValidLang(lang: string): lang is LangCode {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}
