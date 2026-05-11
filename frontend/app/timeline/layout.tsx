import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Timeline - Epochs & Unlocks - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Slay the Spire 2 timeline covering all epochs, eras, and story arcs. Track unlockable cards, relics, and potions across every story progression path.",
  openGraph: {
    title: "Timeline - Epochs & Unlocks - Slay the Spire 2 (sts2) | Spire Codex",
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
