import { SUPPORTED_LANGS, LANG_HREFLANG } from "./languages";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
export const IS_BETA = SITE_URL.includes("beta.");
export const SITE_NAME = IS_BETA ? "Spire Codex (Beta)" : "Spire Codex";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Build the `alternates.languages` map for a given English-side path,
 * pointing to every supported locale variant + `x-default`.
 *
 * Bidirectional hreflang is the indexation signal Google uses to
 * disambiguate translated copies — without it, Google sees /cards and
 * /jpn/cards as competing for the same query and picks ONE to index,
 * dumping the rest into "Crawled - currently not indexed". With it,
 * each locale variant indexes on its own and gets served to its
 * matching audience.
 *
 * Pass the bare path with no /[lang]/ prefix (e.g. "/cards", "/relics"
 * or "/cards/strike"). Returns a Record<hreflang, fullURL> ready to
 * spread into Next.js `alternates.languages`.
 */
export function buildLanguageAlternates(path: string): Record<string, string> {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const map: Record<string, string> = {
    en: `${SITE_URL}${trimmed}`,
    "x-default": `${SITE_URL}${trimmed}`,
  };
  for (const code of SUPPORTED_LANGS) {
    map[LANG_HREFLANG[code]] = `${SITE_URL}/${code}${trimmed}`;
  }
  return map;
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
  return stripTags(text).replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
}
