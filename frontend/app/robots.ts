import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";

export default function robots(): MetadataRoute.Robots {
  // Beta serves near-identical data to prod (different game build) and was
  // showing up in GSC competing with the canonical prod URLs as
  // "Duplicate without user-selected canonical." Disallow all on the
  // beta host so Googlebot stops indexing it.
  if (/beta\./i.test(SITE_URL)) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  // Prod: GSC was logging "Crawled - currently not indexed" against
  // thousands of /api/images/<type>/download URLs and a handful of
  // /static/ asset trees, they're either binary downloads or raw
  // assets, not pages worth indexing. Disallow them so Googlebot stops
  // burning crawl budget there. Real content lives under /, /<lang>/,
  // and the sitemap is unchanged.
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /_next/ is deliberately NOT disallowed: Googlebot has to fetch the
        // JS/CSS chunks to render pages, and a disallow there blocked every
        // asset on every page (crawlers flagged all of them).
        disallow: [
          "/api/",       // backend JSON + download endpoints
          "/static/",    // static asset trees (CDN-served)
          "/uninstall",  // Overwolf post-uninstall survey, entered only by the OW client
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
