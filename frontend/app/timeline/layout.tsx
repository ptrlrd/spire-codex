import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Timeline - Epochs & Unlocks | Spire Codex",
  description:
    "Slay the Spire 2 timeline covering all epochs, eras, and story arcs. Track unlockable cards, relics, and potions across every story progression path.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Timeline - Epochs & Unlocks | Spire Codex",
    description:
      "Slay the Spire 2 timeline covering all epochs, eras, and story arcs. Track unlockable cards, relics, and potions across every story progression path.",
  },
  alternates: {
    canonical: "/timeline",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
