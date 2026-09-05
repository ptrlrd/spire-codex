import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const LANGS = "eng|deu|esp|fra|ita|jpn|kor|pol|ptb|rus|spa|tha|tur|zhs|zht";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Without this, dynamic-route prefetches are stale on arrival
  // (staleTimes.dynamic defaults to 0), so the router re-issues the same
  // origin request for every visible link on each ping — measured 8-9
  // fetches of the same footer link per page view in prod.
  experimental: {
    staleTimes: { dynamic: 180, static: 300 },
  },
  // NitroPay hosts our ads.txt so exchange entries stay current without
  // deploys; the 301 is their recommended setup.
  async redirects() {
    return [
      {
        source: "/ads.txt",
        destination: "https://api.nitropay.com/v1/ads-2467.txt",
        permanent: true,
      },
    ];
  },
  // The /beta section itself is wired up in proxy.ts, which rewrites
  // /beta/cards/x to /cards/x?channel=beta. Only the SEO shielding lives
  // here. Decision: /beta carries zero SEO risk, so every beta URL gets a
  // header-level noindex without touching the shared pages.
  async headers() {
    return [
      {
        // Baseline browser hardening on every response. HSTS is a year
        // without preload (preload is irreversible); the frame lockdown
        // lives on the widget-excluded rule below because /widget/* is
        // meant to be embedded by other sites.
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/((?!widget/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        // The 4.6MB sitemap regenerates every 30 min (ISR) but shipped
        // with max-age=0, so every crawler fetch streamed the whole body
        // from origin. Let the edge hold it between regenerations.
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/beta/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: `/:lang(${LANGS})/beta/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/widget/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=604800",
          },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      // RFC 8288 Link headers on the homepage so agents and API clients can
      // discover the machine-readable surfaces without parsing HTML:
      // the RFC 9727 api-catalog, the human API docs, and llms.txt.
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '</.well-known/api-catalog>; rel="api-catalog", </developers>; rel="service-doc", </llms.txt>; rel="describedby"; type="text/plain"',
          },
        ],
      },
    ];
  },
  reactCompiler: true,
  productionBrowserSourceMaps: true,
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "stay-odd",

  project: "spire-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js proxy.ts, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
