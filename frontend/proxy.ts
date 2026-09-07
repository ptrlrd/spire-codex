import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LANG_PREFIXES } from "@/lib/languages";
import { routing } from "@/i18n/routing";

/** Canonicalise news article URLs.
 *
 *   - Old shape:  /news/{encoded canonical Steam URL}     (PR #96)
 *   - Old shape:  /{lang}/news/{encoded canonical URL}
 *   - New shape:  /news/{gid}                             (current canonical)
 *   - New shape:  /{lang}/news/{gid}
 *
 * The article catchall route ALSO handles the old shape via a runtime
 * `permanentRedirect`, but Next.js dev with Turbopack swallows in-route
 * redirects into an internal re-render so curl / crawlers see a 200 at
 * the legacy URL. Doing it at the proxy.ts layer guarantees a real
 * 308 hits the wire in both dev and prod, and lets the page route stay
 * a simple "render the article" function.
 *
 * The proxy.ts only fires when the slug looks like an encoded Steam
 * URL — bare-gid requests skip it entirely, so the cost on the hot path
 * is one regex test per /news/* request. */
const NEWS_PATH = /^(\/[a-z]{3})?\/news\/(.+)$/;
// Matches both Steam URL flavours that the API hands back: the canonical
// `store.steampowered.com/news/app/...` form and the older
// `steamstore-a.akamaihd.net/news/externalpost/...` wrapper press
// articles ship with. Both URL-encoded (%3A, %2F) since they're sitting
// inside a URL slug.
const ENCODED_STEAM =
  /^https?(?:%3A|:)\/?(?:%2F|\/){2}(?:store\.steampowered\.com|steamstore-a\.akamaihd\.net)/i;

function gidFromEncoded(seg: string): string | null {
  let decoded = seg;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    /* leave raw */
  }
  // Pull the last digit-only segment — Steam puts the gid at the end of
  // every URL variant (`view/{gid}`, `externalpost/{feed}/{gid}`).
  const parts = decoded.split(/[/?#]/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d{6,}$/.test(parts[i])) return parts[i];
  }
  return null;
}

const LANG_CODES = LANG_PREFIXES;

// Detail routes whose slugs are canonically lowercase (what the sitemap
// declares). Any other casing serves the same page and self-canonicalises,
// so Google treats /cards/ABRASIVE and /cards/abrasive as competing
// duplicates — 308 every non-lowercase variant onto the canonical instead.
// Deliberately excludes user-content routes with case-significant ids
// (/runs hashes, /users, /tier-list-maker).
const LOWERCASE_DETAIL_TYPES = new Set([
  "achievements",
  "acts",
  "afflictions",
  "ascensions",
  "badges",
  "cards",
  "characters",
  "enchantments",
  "encounters",
  "events",
  "guides",
  "intents",
  "keywords",
  "mechanics",
  "modifiers",
  "monsters",
  "orbs",
  "potions",
  "powers",
  "relics",
  "timeline",
]);

function lowercaseRedirect(req: NextRequest): NextResponse | null {
  const parts = req.nextUrl.pathname.split("/");
  let i = 1;
  if (LANG_CODES.has(parts[i])) i++;
  if (parts[i] === "beta") i++;
  if (!LOWERCASE_DETAIL_TYPES.has(parts[i])) return null;
  const slug = parts.slice(i + 1);
  if (slug.length === 0 || !slug.some((s) => /[A-Z]/.test(s))) return null;
  const url = req.nextUrl.clone();
  url.pathname = [
    ...parts.slice(0, i + 1),
    ...slug.map((s) => s.toLowerCase()),
  ].join("/");
  return NextResponse.redirect(url, 308);
}

// Entity types with a real /beta/<type>/[id] detail route (force-dynamic
// pages under app/beta/), exempt from the rewrite below.
const BETA_DETAIL_TYPES = new Set([
  "cards",
  "relics",
  "monsters",
  "potions",
  "enchantments",
  "encounters",
  "events",
  "powers",
  "keywords",
  "orbs",
]);

/** The beta section reuses the entire existing page tree: /beta/cards/x
 * renders /cards/x with ?channel=beta injected (server components read it
 * from searchParams; client fetches detect the /beta path). /beta itself is
 * a real page (the what's-new landing); the localized /{lang}/beta falls
 * back to it.
 *
 * This lives in proxy.ts rather than next.config rewrites because a
 * config rewrite's destination query never reaches `searchParams` on the
 * client router's RSC refetch: the page re-renders channel-less, the API
 * 404s for beta-only entities, and redirectMissingEntity bounces the
 * browser to the hub. NextResponse.rewrite carries the query on both
 * document and RSC requests. */
function betaRewrite(req: NextRequest): NextResponse | null {
  const parts = req.nextUrl.pathname.split("/");
  let lang = "";
  let rest: string[];
  if (parts[1] === "beta") {
    rest = parts.slice(2);
  } else if (LANG_CODES.has(parts[1]) && parts[2] === "beta") {
    lang = parts[1];
    rest = parts.slice(3);
  } else {
    return null;
  }
  // Real routes under /beta (the landing page in every locale, and the
  // English force-dynamic detail pages, which can't share the main pages
  // because those are ISR-cached) only need the locale segment.
  if (rest.length === 0) return null;
  if (!lang && rest.length === 2 && BETA_DETAIL_TYPES.has(rest[0])) return null;
  const url = req.nextUrl.clone();
  const locale = lang || routing.defaultLocale;
  if (rest.length === 0) {
    url.pathname = `/${locale}/beta`;
    return NextResponse.rewrite(url);
  }
  url.pathname = `/${locale}/${rest.join("/")}`;
  url.searchParams.set("channel", "beta");
  return NextResponse.rewrite(url);
}

// Sections that only exist in English (no translated data behind them). A
// localized URL for one of these 308s to the English page so crawlers see
// one canonical instead of thirteen chrome-only duplicates.
const ENGLISH_ONLY_SECTIONS = new Set(["admin", "players"]);
const ENGLISH_ONLY_PATHS = new Set(["news/codex", "cards/browse"]);

function englishOnly(parts: string[]): boolean {
  if (ENGLISH_ONLY_SECTIONS.has(parts[2])) return true;
  if (ENGLISH_ONLY_PATHS.has(`${parts[2]}/${parts[3]}`)) return true;
  return parts[2] === "timeline" && parts.length > 3 && parts[3] !== "";
}

/** Every page lives under app/[locale]. English is the bare URL, so a
 * request without a language prefix is rewritten to the `eng` segment, and
 * an explicit /eng/ prefix redirects to the bare canonical. Other prefixes
 * pass straight through unless the section is English-only. */
function metaRedirect(req: NextRequest): NextResponse | null {
  const parts = req.nextUrl.pathname.split("/");
  const i = LANG_CODES.has(parts[1]) ? 2 : 1;
  if (parts[i] !== "meta" || parts.length !== i + 1) return null;
  const url = req.nextUrl.clone();
  url.pathname = [...parts.slice(0, i), "leaderboards", "stats"].join("/");
  return NextResponse.redirect(url, 308);
}

function localeRewrite(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const parts = pathname.split("/");
  const first = parts[1];
  if (first === routing.defaultLocale || (LANG_CODES.has(first) && englishOnly(parts))) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(first.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (LANG_CODES.has(first)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/${routing.defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export function proxy(req: NextRequest) {
  // Redirect before the beta rewrite so the browser lands on the corrected
  // URL and only then gets rewritten.
  const lower = lowercaseRedirect(req);
  if (lower) return lower;
  const news = newsRedirect(req);
  if (news) return news;
  const meta = metaRedirect(req);
  if (meta) return meta;
  const beta = betaRewrite(req);
  if (beta) return beta;
  return localeRewrite(req);
}

function newsRedirect(req: NextRequest): NextResponse | null {
  const m = req.nextUrl.pathname.match(NEWS_PATH);
  if (!m) return null;
  const langPrefix = m[1] ?? "";
  const slug = m[2];
  if (!ENCODED_STEAM.test(slug)) return null;
  const gid = gidFromEncoded(slug);
  if (!gid) return null;
  const url = req.nextUrl.clone();
  url.pathname = `${langPrefix}/news/${gid}`;
  // 308 (permanent) so search engines transfer the existing index entries
  // for the old encoded URLs over to the bare-gid canonical.
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Every page request: the locale rewrite has to see all of them. Route
  // handlers under /api, Next internals, and files with an extension
  // (favicon, sitemap.xml, robots.txt, .well-known) are left alone.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
