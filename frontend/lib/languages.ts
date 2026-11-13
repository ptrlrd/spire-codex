/**
 * Language configuration for international SEO landing pages.
 * These are the 16 non-English languages supported by the game's localization
 * (zht shipped in game v0.109.0, ara in v0.113.0; untranslated strings fall back to English).
 */

export const SUPPORTED_LANGS = [
  "ara",
  "deu",
  "esp",
  "fra",
  "ind",
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
/** Languages written right to left. */
export const RTL_LANGS: ReadonlySet<string> = new Set(["ara"]);

export const LANG_PREFIXES: ReadonlySet<string> = new Set(SUPPORTED_LANGS);

/** Sections and paths that only exist in English: localized URLs 308 to the bare path. */
export const ENGLISH_ONLY_SECTIONS: ReadonlySet<string> = new Set([
  "admin",
  "players",
]);
export const ENGLISH_ONLY_PATHS: ReadonlySet<string> = new Set([
  "news/codex",
  "cards/browse",
]);

/** Browser language (BCP-47) to the game code it should be offered, most specific first. */
export function langFromBrowser(tag: string): LangCode | "eng" | null {
  const t = tag.toLowerCase();
  if (t.startsWith("en")) return "eng";
  if (t.startsWith("zh")) return /hant|tw|hk|mo/.test(t) ? "zht" : "zhs";
  if (t.startsWith("es"))
    return t === "es" || t.startsWith("es-es") ? "esp" : "spa";
  if (t.startsWith("pt")) return "ptb";
  const two: Record<string, LangCode> = {
    ar: "ara",
    de: "deu",
    id: "ind",
    fr: "fra",
    it: "ita",
    ja: "jpn",
    ko: "kor",
    pl: "pol",
    ru: "rus",
    th: "tha",
    tr: "tur",
  };
  return two[t.slice(0, 2)] ?? null;
}

/** Maps 3-letter game codes to BCP-47 / hreflang codes */
export const LANG_HREFLANG: Record<LangCode, string> = {
  ara: "ar",
  deu: "de",
  esp: "es-ES",
  fra: "fr",
  ind: "id",
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

/** Open Graph locale codes (language_TERRITORY), distinct from the hreflang tags above. */
export const LANG_OG_LOCALE: Record<LangCode, string> = {
  ara: "ar_AR",
  deu: "de_DE",
  esp: "es_ES",
  fra: "fr_FR",
  ind: "id_ID",
  ita: "it_IT",
  jpn: "ja_JP",
  kor: "ko_KR",
  pol: "pl_PL",
  ptb: "pt_BR",
  rus: "ru_RU",
  spa: "es_LA",
  tha: "th_TH",
  tur: "tr_TR",
  zhs: "zh_CN",
  zht: "zh_TW",
};

/** Human-readable native language names */
export const LANG_NAMES: Record<LangCode, string> = {
  ara: "العربية",
  deu: "Deutsch",
  esp: "Español (ES)",
  fra: "Français",
  ind: "Bahasa Indonesia",
  ita: "Italiano",
  jpn: "日本語",
  kor: "한국어",
  pol: "Polski",
  ptb: "Português (BR)",
  rus: "Русский",
  spa: "Español (LA)",
  tha: "ไทย",
  tur: "Türkçe",
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
  ara: "Slay the Spire 2 (STS2)",
  deu: "Slay the Spire 2 (STS2)",
  esp: "Slay the Spire 2 (STS2)",
  fra: "Slay the Spire 2 (STS2)",
  ind: "Slay the Spire 2 (STS2)",
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
  ara: "قاعدة بيانات",
  deu: "Datenbank",
  esp: "Base de datos",
  fra: "Base de données",
  ind: "Basis Data",
  ita: "Database",
  jpn: "データベース",
  kor: "데이터베이스",
  pol: "Baza danych",
  ptb: "Banco de dados",
  rus: "База данных",
  spa: "Base de datos",
  tha: "ฐานข้อมูล",
  tur: "Veritabanı",
  zhs: "数据库",
  zht: "資料庫",
};

/** Localized "Cards" label */
export const LANG_CARDS: Record<LangCode, string> = {
  ara: "البطاقات",
  deu: "Karten",
  esp: "Cartas",
  fra: "Cartes",
  ind: "Kartu",
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
  ara: "الآثار",
  deu: "Relikte",
  esp: "Reliquias",
  fra: "Reliques",
  ind: "Pusaka",
  ita: "Reliquie",
  jpn: "レリック",
  kor: "유물",
  pol: "Artefakty",
  ptb: "Relíquias",
  rus: "Реликвии",
  spa: "Reliquias",
  tha: "เครื่องราง",
  tur: "Kalıntılar",
  zhs: "遗物",
  zht: "遺物",
};
