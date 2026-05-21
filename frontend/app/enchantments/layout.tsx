import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Enchantments - Complete Enchantment List - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Browse all Slay the Spire 2 enchantments. View effects, card type restrictions, and stackability.";

export const metadata: Metadata = {
  title,
  description:
    "Every Slay the Spire 2 (sts2) enchantment — effects, card-type restrictions, stackability, and the extra card text added to Attack, Skill, and Power cards.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/enchantments`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/enchantments", languages: buildLanguageAlternates("/enchantments") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
