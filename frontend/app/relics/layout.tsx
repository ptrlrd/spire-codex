import type { Metadata } from "next";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "289+";
  try {
    const stats = await api.getStats();
    count = String(stats.relics);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Slay the Spire 2 Relics - Complete Relic List | Spire Codex",
    description: `Browse all ${count} Slay the Spire 2 relics. Filter by rarity (Common, Uncommon, Rare, Shop, Event, Ancient) and character pool (Ironclad, Silent, Defect, Necrobinder, Regent). View relic effects, flavor text, and images.`,
    openGraph: {
      title: "Slay the Spire 2 Relics - Complete Relic List | Spire Codex",
      description: `Browse all ${count} Slay the Spire 2 relics. Filter by rarity and character pool. View relic effects and images.`,
    },
    alternates: { canonical: "/relics" },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
