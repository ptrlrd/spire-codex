import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Badges - Run-End Awards - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "All run-end badges in Slay the Spire 2 — see every badge, what it requires, and which are multiplayer-only.";

export const metadata: Metadata = {
  title,
  description:
    "All run-end badges in Slay the Spire 2 — Big Deck, Perfect, Speedy, KaChing, and more. Bronze, Silver, and Gold tiers. Awarded on the Game Over screen.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/badges`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/badges", languages: buildLanguageAlternates("/badges") },
};

export default function BadgesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
