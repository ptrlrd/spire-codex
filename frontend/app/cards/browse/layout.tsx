import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cards - Browse by Category - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Browse Slay the Spire 2 cards by type, rarity, character, and keyword. Find all Attack, Skill, and Power cards across Ironclad, Silent, Defect, Necrobinder, and Regent.",
  openGraph: {
    title: "Cards - Browse by Category - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Browse Slay the Spire 2 cards by type, rarity, character, and keyword.",
  },
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
