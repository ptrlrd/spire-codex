import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "289+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.relics);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Relics - Complete Relic List - Slay the Spire 2 (sts2) | Spire Codex",
    description: `Browse all ${count} Slay the Spire 2 (sts2) relics. Filter by rarity (Common, Uncommon, Rare, Shop, Event, Ancient) and character pool (Ironclad, Silent, Defect, Necrobinder, Regent). View relic effects, flavor text, and images.`,
    openGraph: {
      title: "Relics - Complete Relic List - Slay the Spire 2 (sts2) | Spire Codex",
      description: `Browse all ${count} Slay the Spire 2 (sts2) relics. Filter by rarity and character pool. View relic effects and images.`,
    },
    alternates: { canonical: "/relics", languages: buildLanguageAlternates("/relics") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
