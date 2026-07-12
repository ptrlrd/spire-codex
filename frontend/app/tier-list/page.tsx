import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import { TierListBody } from "./TierListBody";

// Tier-list hub: scores refresh on the backend every 60s, so 5min
// HTML cache is comfortably fresh and lets CF serve from edge.
export const revalidate = 300;

export const metadata: Metadata = {
  // Title leads with both abbreviated ("STS2") and full game name to
  // match either query phrasing, the actual SERPs we're targeting use
  // both. Order chosen so the abbreviation lands inside the truncation
  // window on mobile (Google trims at ~60 chars on phones).
  title: `Tier List - Cards, Relics & Potions Ranked - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "Slay the Spire 2 (sts2) tier list ranking every card, relic, and potion S through F. Codex Score from community win rates. Updated daily after every patch.",
  alternates: { canonical: `${SITE_URL}/tier-list`, languages: buildLanguageAlternates(`/tier-list`) },
  openGraph: {
    title: `Tier List - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    description: "Every Slay the Spire 2 card, relic, and potion ranked S → F based on community win-rate data.",
    url: `${SITE_URL}/tier-list`,
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Tier List - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    description: "Every Slay the Spire 2 card, relic, and potion ranked S → F based on community win-rate data.",
  },
};

// Base English route. Localized copies live at /[lang]/tier-list and render
// the same TierListBody with the URL language.
export default async function TierListIndex() {
  return <TierListBody lang="eng" />;
}
