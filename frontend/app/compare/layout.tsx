import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Character Comparisons - Side by Side | Spire Codex",
  description:
    "Compare Slay the Spire 2 characters side by side. View stat differences, card pool breakdowns, keyword distributions, and starting decks for Ironclad, Silent, Defect, Necrobinder, and Regent.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Character Comparisons - Side by Side | Spire Codex",
    description:
      "Compare Slay the Spire 2 characters side by side. Stats, card pools, keywords, and starting decks.",
  },
  alternates: {
    canonical: "/compare",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
