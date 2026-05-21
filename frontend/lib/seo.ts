import { SUPPORTED_LANGS, LANG_HREFLANG } from "./languages";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
export const IS_BETA = SITE_URL.includes("beta.");
export const SITE_NAME = IS_BETA ? "Spire Codex (Beta)" : "Spire Codex";
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
  const flat = text.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
  if (flat.length <= max) return flat;
  // Reserve 1 char for the ellipsis we append. Slice to (max-1), then
  // back up to the previous word boundary so we don't truncate
  // mid-word.
  const sliced = flat.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced;
  return cut.replace(/[\s\p{P}]+$/u, "") + "…";
}
