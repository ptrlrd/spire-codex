import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 Badges - Run-End Awards | Spire Codex",
  description:
    "All run-end badges in Slay the Spire 2 — Big Deck, Perfect, Speedy, KaChing, and more. Bronze, Silver, and Gold tiers. Awarded on the Game Over screen.",
  openGraph: {
    title: "Slay the Spire 2 Badges - Run-End Awards | Spire Codex",
    description:
      "All run-end badges in Slay the Spire 2 — see every badge, what it requires, and which are multiplayer-only.",
  },
  alternates: { canonical: "/badges" },
};

export default function BadgesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
