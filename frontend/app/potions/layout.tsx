import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "63+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.potions);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Potions - Complete Potion List - Slay the Spire 2 (sts2) | Spire Codex",
    description: `Browse all ${count} Slay the Spire 2 (sts2) potions. Filter by rarity (Common, Uncommon, Rare) and character pool (Ironclad, Silent, Defect, Necrobinder, Regent). View potion effects and descriptions.`,
    openGraph: {
      title: "Potions - Complete Potion List - Slay the Spire 2 (sts2) | Spire Codex",
      description: `Browse all ${count} Slay the Spire 2 (sts2) potions. Filter by rarity and character pool.`,
    },
    alternates: { canonical: "/potions", languages: buildLanguageAlternates("/potions") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
