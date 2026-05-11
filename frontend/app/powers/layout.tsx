import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "260";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.powers);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Powers - Complete Power List - Slay the Spire 2 (sts2) | Spire Codex",
    description: `Browse all ${count} Slay the Spire 2 (sts2) powers — buffs, debuffs, and neutral effects. Filter by type and stack behavior. View descriptions, icons, and details for every power.`,
    openGraph: {
      title: "Powers - Complete Power List - Slay the Spire 2 (sts2) | Spire Codex",
      description: `Browse all ${count} Slay the Spire 2 (sts2) powers — buffs, debuffs, and neutral effects. Filter by type and stack behavior.`,
    },
    alternates: { canonical: "/powers", languages: buildLanguageAlternates("/powers") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
