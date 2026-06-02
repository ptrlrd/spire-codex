import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import StatsClient from "./StatsClient";

export const dynamic = "force-dynamic";

const title = "Stats - Slay the Spire 2 | Spire Codex";
const description =
  "Slay the Spire 2 stats, win rates by character, card pick rates, most common relics, deadliest encounters. Community-driven data from submitted runs.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/leaderboards/stats",
    languages: buildLanguageAlternates("/leaderboards/stats"),
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/leaderboards/stats`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function StatsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Stats", href: "/leaderboards/stats" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Community Stats",
      description:
        "Win rates by character, card pick rates, most common relics, deadliest encounters, aggregated from community-submitted runs.",
      path: "/leaderboards/stats",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <StatsClient />
    </>
  );
}
