import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Discord Bot - Knowledge Demon - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Discord bot for Slay the Spire 2 communities. Card, relic, monster, and potion lookups plus moderation tools.";

export const metadata: Metadata = {
  title,
  description:
    "Knowledge Demon — a Discord bot for Slay the Spire 2 (sts2) communities. Slash commands for cards, relics, monsters, events, plus moderation and news feeds.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/knowledge-demon`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/knowledge-demon",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
