import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";

export default function robots(): MetadataRoute.Robots {
  // GSC was logging "Crawled - currently not indexed" against thousands
  // of /api/images/<type>/download URLs and a handful of /static/
  // asset trees — they're either binary downloads or raw assets, not
  // pages worth indexing. Disallow them so Googlebot stops burning
  // crawl budget there. Real content lives under /, /<lang>/, and the
  // sitemap is unchanged.
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",       // backend JSON + download endpoints
          "/static/",    // static asset trees (CDN-served)
          "/_next/",     // Next.js build output (already not indexable but explicit)
          "/uninstall",  // Overwolf post-uninstall survey — entered only by the OW client
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
