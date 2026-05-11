import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Badges - Run-End Awards - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "All run-end badges in Slay the Spire 2 — Big Deck, Perfect, Speedy, KaChing, and more. Bronze, Silver, and Gold tiers. Awarded on the Game Over screen.",
  openGraph: {
    title: "Badges - Run-End Awards - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "All run-end badges in Slay the Spire 2 — see every badge, what it requires, and which are multiplayer-only.",
  },
  alternates: { canonical: "/badges", languages: buildLanguageAlternates("/badges") },
};

export default function BadgesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
