import type { Metadata } from "next";
import { Suspense } from "react";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import ChartsClient from "./ChartsClient";

export const metadata: Metadata = {
  title: `Run Charts - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "Interactive charts over community-submitted Slay the Spire 2 runs: win rate by floor, ascension and over time, damage per encounter, run stat distributions and scatters. Filter by player count, ascension, game mode, or a single player.",
  alternates: { canonical: `${SITE_URL}/charts`, languages: buildLanguageAlternates("/charts") },
  openGraph: {
    title: `Slay the Spire 2 (sts2) Run Charts | ${SITE_NAME}`,
    description:
      "Dig into aggregates of community-submitted Slay the Spire 2 runs with interactive charts.",
    url: `${SITE_URL}/charts`,
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title: `Slay the Spire 2 (sts2) Run Charts | ${SITE_NAME}` },
};

export default function ChartsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Charts", href: "/charts" },
    ]),
  ];
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Run Charts</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Interactive aggregates over community-submitted runs. Pick a chart, slice by player
        count, ascension, game mode, or a single player. Aggregation happens server-side, so
        every view is a single small request.
      </p>
      <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">Loading…</div>}>
        <ChartsClient />
      </Suspense>
    </div>
  );
}
