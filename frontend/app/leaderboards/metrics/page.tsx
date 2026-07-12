import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import MetricsClient from "./MetricsClient";
import { loadMetrics } from "./metrics-data";

// Render per request (so a build-time bake with the backend unreachable
// never freezes an empty table) but cache the underlying data fetch inside
// loadMetrics. The backend already serves a pre-built snapshot, so the heavy
// work happens at most once per window across all requests; the per-request
// SSR of the table itself is cheap.
export const dynamic = "force-dynamic";

const title = `Card Metrics - Codex Elo, Win Rate & Pick Rate - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
const description =
  "Every Slay the Spire 2 (sts2) card ranked by Codex Elo, Codex Score, win rate and pick rate. Revealed-preference ratings from community card-reward picks, plus per-act splits and raw counts.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/leaderboards/metrics",
    languages: buildLanguageAlternates("/leaderboards/metrics"),
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/leaderboards/metrics`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ bracket?: string }>;
}) {
  const sp = await searchParams;
  const { rows, baselineWinRate, totalRuns, bracket } = await loadMetrics(
    "eng",
    sp.bracket || "all"
  );

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Card Metrics", href: "/leaderboards/metrics" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Card Metrics",
      description,
      path: "/leaderboards/metrics",
    }),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <MetricsClient
        rows={rows}
        baselineWinRate={baselineWinRate}
        totalRuns={totalRuns}
        bracket={bracket}
      />
    </>
  );
}
