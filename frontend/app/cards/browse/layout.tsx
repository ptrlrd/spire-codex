import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Cards - Browse by Category | Spire Codex",
  description:
    "Browse Slay the Spire 2 cards by type, rarity, character, and keyword. Find all Attack, Skill, and Power cards across Ironclad, Silent, Defect, Necrobinder, and Regent.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Cards - Browse by Category | Spire Codex",
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
