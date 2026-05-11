import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "87";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.encounters);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Encounters - All Combat Encounters - Slay the Spire 2 (sts2) | Spire Codex",
    description: `Slay the Spire 2 (sts2) encounters — browse all ${count} combat encounters including normal fights, elites, and bosses. View monster compositions, act assignments, and room types.`,
    openGraph: {
      title: "Encounters - All Combat Encounters - Slay the Spire 2 (sts2) | Spire Codex",
      description: `Slay the Spire 2 (sts2) encounters — browse all ${count} combat encounters including normal fights, elites, and bosses.`,
    },
    alternates: { canonical: "/encounters", languages: buildLanguageAlternates("/encounters") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
