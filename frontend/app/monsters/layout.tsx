import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "111";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.monsters);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Slay the Spire 2 (STS2) Monsters - Complete Monster List | Spire Codex",
    description: `Slay the Spire 2 (STS2) monsters — browse all ${count} normals, elites, and bosses. View HP values, moves, damage stats, and ascension scaling.`,
    openGraph: {
      title: "Slay the Spire 2 (STS2) Monsters - Complete Monster List | Spire Codex",
      description: `Slay the Spire 2 (STS2) monsters — browse all ${count} normals, elites, and bosses. View HP, moves, and ascension scaling.`,
    },
    alternates: { canonical: "/monsters", languages: buildLanguageAlternates("/monsters") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
