import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";

const title = "Timeline - Epochs & Unlocks - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Slay the Spire 2 timeline covering all epochs, eras, and story arcs. Track unlockable cards, relics, and potions across every story progression path.";
const ogDesc = "Slay the Spire 2 timeline covering all epochs, eras, and story arcs. Track unlockable cards, relics, and potions across every story progression path.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/timeline`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/timeline",
    languages: buildLanguageAlternates("/timeline"),
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
