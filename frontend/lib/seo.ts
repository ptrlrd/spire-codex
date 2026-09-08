import type { Metadata } from "next";
import {
  SUPPORTED_LANGS,
  LANG_HREFLANG,
  isValidLang,
  getLangOrDefault,
  LangCode,
} from "./languages";

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
 * The English title suffix, as a Next `title.template`. Pages supply only
 * their own segment and this appends the rest.
 *
 * Any layout that sets a plain-string `title` **replaces** the inherited
 * template with nothing, silently un-suffixing every route beneath it — so
 * a section layout with children must re-declare the template alongside
 * its title: `title: { default: title, template: TITLE_TEMPLATE }`.
 * The localized equivalent is built per-locale in `app/[lang]/layout.tsx`.
 */
export const TITLE_TEMPLATE = `%s - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
export const TITLE_DEFAULT = `Database - Slay the Spire 2 (sts2) | ${SITE_NAME}`;

/**
 * Build the `alternates.languages` map for a given English-side path,
 * pointing to every supported locale variant + `x-default`.
 *
 * Bidirectional hreflang is the indexation signal Google uses to
 * disambiguate translated copies, without it, Google sees /cards and
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
  // For the home page the localized URL is /<code>, not /<code>/ — the
  // trailing-slash form 308s, and hreflang alternates must not redirect
  // (every crawl flagged them as incorrect hreflang links).
  const suffix = trimmed === "/" ? "" : trimmed;
  for (const code of SUPPORTED_LANGS) {
    // "eng" is a valid [lang] segment, but its canonical home is the bare
    // path above, not /eng/... — skip it here so the loop doesn't clobber
    // the `en` entry already seeded to the bare path with `/eng/...`.
    if (code === "eng") continue;
    map[LANG_HREFLANG[code]] = `${SITE_URL}/${code}${suffix}`;
  }
  return map;
}

/**
 * Prefix a bare path with a locale segment, when one is present.
 *
 * The single implementation of locale prefixing, shared by
 * `buildPageMetadata` below and by JSON-LD call sites (whose builders take
 * an already-prefixed path, the opposite convention to
 * `buildLanguageAlternates`). Pass the bare path either way.
 *
 * `lang` is used exactly as given and never defaulted: an absent or
 * unrecognised segment yields the bare English path, never `/eng/...`.
 * `"eng"` itself also yields the bare path — it's a valid `[lang]` segment
 * (so `/eng/cards` renders), but /eng/... and the bare page are the same
 * English content, so canonical hands all the equity to one URL.
 */
export function localizedPath(lang: string, path: string): string {
  const bare = path.startsWith("/") ? path : `/${path}`;
  if (!lang || lang === "eng" || !isValidLang(lang)) return bare;
  // The home page localizes to `/<code>`, not `/<code>/` — the trailing
  // slash form 308s, and neither canonicals nor hreflang may point at a
  // redirect.
  return bare === "/" ? `/${lang}` : `/${lang}${bare}`;
}

export interface PageMetadataInput {
  /**
   * `[lang]` parameter on those routes. You should pass the actual param as given, so the method knows whether to de-index any non-canonical paths we may allow to render.
   */
  langParam?: string;
  /** Bare path, never locale-prefixed: "/relics", "/cards/strike", "/". */
  path: string;
  /**
   * This segment only, never the full title — the layout's `title.template`
   * appends the site suffix, and og/twitter titles inherit the resolved
   * result. See `app/layout.tsx` and `app/[lang]/layout.tsx`.
   */
  title: string;
  description?: string;
  /** Defaults to "website". */
  ogType?: "website" | "article" | "profile";
  /**
   * Adds robots noindex for all languages, or explicitly prevents that from being added if it would be inferred from other parameters (with explicit false).
   * By default we no-index when either langParam is `"eng"` (since undefined is the canonical path for English) or when supressLanguageAlternates is true and langParam is anything other than `undefined`.
   */
  noIndex?: boolean;
  /**
   * Whether this route self-canonicalizes per locale and advertises
   * hreflang or will only index the english route.
   *
   * Used mostly as a temporary stopgap when SEO is suffering due to insufficient localisation coverage in the page body.
   * When true, non-english routes will also have no-index robots added (unless no-index is explicitly false).
   */
  supressLanguageAlternates?: boolean;
}

/**
 * Build a page's Next.js `Metadata` in a standardised/templated way suitable typically for all routes and their [lang] counterparts
 * @see PageMetadataInput for parameter details
 */
export function buildPageMetadata({
  langParam,
  path,
  title,
  description,
  ogType,
  noIndex,
  supressLanguageAlternates,
}: PageMetadataInput): Metadata {
  const lang = getLangOrDefault(langParam);
  noIndex ??=
    langParam === "eng" ||
    (supressLanguageAlternates && langParam !== undefined);

  const canonical = localizedPath(
    supressLanguageAlternates ? "eng" : lang,
    path,
  );
  // because we are trying to incrementally introduce this now, and don't yet have the template applying at the layout level as such (and because it's almost moot when using a helper)
  // we'll bridge the compatibility by having the helper manually apply the template and force an absolute override
  const titleToApply = {
    absolute: TITLE_TEMPLATE.replace("%s", title),
  };
  return {
    metadataBase: SITE_URL,
    title: titleToApply,
    description,
    openGraph: {
      title: titleToApply,
      description,
      url: canonical,
      type: ogType ?? "website",
      siteName: SITE_NAME,
      locale: LANG_HREFLANG[lang],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    alternates: {
      canonical,
      languages: supressLanguageAlternates
        ? undefined
        : buildLanguageAlternates(path),
    },
    twitter: {
      card: "summary_large_image",
      title: titleToApply,
      description,
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
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
