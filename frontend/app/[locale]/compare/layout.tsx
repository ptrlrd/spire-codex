import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Character Comparisons - Side by Side - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Compare Slay the Spire 2 characters side by side. Stats, card pools, keywords, and starting decks.";

export const metadata: Metadata = {
  title,
  description:
    "Side-by-side Slay the Spire 2 (sts2) character comparisons. Stat differences, card-pool breakdowns, keyword distribution, and starting decks for all 10 pairs.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/compare`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/compare", languages: buildLanguageAlternates("/compare") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
