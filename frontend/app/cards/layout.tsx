import type { Metadata } from "next";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "576+";
  try {
    const stats = await api.getStats();
    count = String(stats.cards);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Slay the Spire 2 Cards - Complete Card List | Spire Codex",
    description: `Browse all ${count} Slay the Spire 2 cards. Filter by character (Ironclad, Silent, Defect, Necrobinder, Regent), type, rarity, and keywords. View card art, stats, upgrades, and related cards.`,
    openGraph: {
      title: "Slay the Spire 2 Cards - Complete Card List | Spire Codex",
      description: `Browse all ${count} Slay the Spire 2 cards. Filter by character, type, rarity, and keywords.`,
    },
    alternates: { canonical: "/cards" },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
