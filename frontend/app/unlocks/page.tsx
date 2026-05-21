import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import UnlocksClient from "./UnlocksClient";

const title = "Unlocks - All Unlockable Cards, Relics & Potions - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Complete list of all unlockable content in Slay the Spire 2 — 60 cards, 45 relics, 21 potions, and 4 characters unlocked through timeline progression.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/unlocks", languages: buildLanguageAlternates("/unlocks") },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/unlocks`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function Page() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Unlocks", href: "/unlocks" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Unlocks",
      description:
        "All unlockable cards, relics, potions, and characters in Slay the Spire 2 with their epoch progression and score thresholds.",
      path: "/unlocks",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <UnlocksClient />
    </>
  );
}
