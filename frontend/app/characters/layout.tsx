import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Characters - All Playable Characters - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Slay the Spire 2 characters — Ironclad, Silent, Defect, Necrobinder, and Regent. Starting decks, relics, stats, and more.";

export const metadata: Metadata = {
  title,
  description:
    "All five Slay the Spire 2 (sts2) characters — Ironclad, Silent, Defect, Necrobinder, Regent. Starting decks, starter relic, HP, gold, and energy.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/characters`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/characters", languages: buildLanguageAlternates("/characters") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
