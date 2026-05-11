import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Discord Bot - Knowledge Demon - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Knowledge Demon is a Discord bot for Slay the Spire 2 (sts2) communities, with slash commands for cards, relics, monsters, potions, characters, events, plus moderation tools and news feeds. Powered by the Spire Codex API.",
  openGraph: {
    title: "Discord Bot - Knowledge Demon - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Discord bot for Slay the Spire 2 communities. Card, relic, monster, and potion lookups plus moderation tools.",
  },
  alternates: {
    canonical: "/knowledge-demon",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
