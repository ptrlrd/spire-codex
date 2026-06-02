import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import EncounterStatsClient from "./EncounterStatsClient";

export const dynamic = "force-dynamic";

const title = "Encounter Stats - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Per-encounter Slay the Spire 2 stats, fatal counts, average damage, average turns, and a per-character breakdown for every monster, elite, and boss. Live aggregation from submitted community runs.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/leaderboards/encounters",
    languages: buildLanguageAlternates("/leaderboards/encounters"),
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/leaderboards/encounters`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function EncountersStatsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Encounters", href: "/leaderboards/encounters" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Encounter Stats",
      description:
        "Per-encounter aggregation: fatal counts, average damage taken, average turn count, and per-character breakdown for every monster, elite, and boss.",
      path: "/leaderboards/encounters",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <EncounterStatsClient />
    </>
  );
}
