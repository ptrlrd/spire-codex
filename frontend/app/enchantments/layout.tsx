import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Enchantments - Complete Enchantment List | Spire Codex",
  description:
    "Browse all Slay the Spire 2 enchantments. View enchantment effects, card type restrictions, stackability, and extra card text for Attack, Skill, and Power enchantments.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Enchantments - Complete Enchantment List | Spire Codex",
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
