import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Cards - Browse by Category - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc = "Browse Slay the Spire 2 cards by type, rarity, character, and keyword.";

export const metadata: Metadata = {
  title,
  description:
    "Filtered card collections for Slay the Spire 2 (sts2) — 41 curated lists by type, rarity, character, and keyword (Attack, Skill, Power, Rare, Ironclad, more).",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/cards/browse`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/cards/browse",
  },
};

export default function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
