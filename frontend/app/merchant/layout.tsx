import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 Merchant Guide - Shop Prices & Fake Merchant | Spire Codex",
  description:
    "Complete Slay the Spire 2 merchant guide. Card, relic, and potion prices by rarity. Card removal costs. Fake Merchant relics and their effects. All values extracted from game source.",
  openGraph: {
    title: "Slay the Spire 2 Merchant Guide - Shop Prices & Fake Merchant | Spire Codex",
    description:
      "Complete merchant price guide for Slay the Spire 2. Card, relic, and potion costs by rarity. Fake Merchant relic effects.",
  },
  alternates: { canonical: "/merchant" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
