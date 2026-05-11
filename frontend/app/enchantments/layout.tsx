import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enchantments - Complete Enchantment List - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Browse all Slay the Spire 2 enchantments. View enchantment effects, card type restrictions, stackability, and extra card text for Attack, Skill, and Power enchantments.",
  openGraph: {
    title: "Enchantments - Complete Enchantment List - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Browse all Slay the Spire 2 enchantments. View effects, card type restrictions, and stackability.",
  },
  alternates: {
    canonical: "/enchantments",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
