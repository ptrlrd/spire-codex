import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Merchant Guide - Shop Prices & Fake Merchant - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Complete merchant price guide for Slay the Spire 2. Card, relic, and potion costs by rarity. Fake Merchant relic effects.";

export const metadata: Metadata = {
  title,
  description:
    "Slay the Spire 2 (sts2) merchant guide — card, relic, and potion shop prices by rarity, card removal costs, Fake Merchant relics. Values from the game source.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/merchant`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/merchant", languages: buildLanguageAlternates("/merchant") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
