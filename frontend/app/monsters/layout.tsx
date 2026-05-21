import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "111";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.monsters);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Monsters - Complete Monster List - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Slay the Spire 2 (sts2) monsters — browse all ${count} normals, elites, and bosses. View HP, moves, and ascension scaling.`;
  return {
    title,
    description: `All ${count} Slay the Spire 2 (sts2) monsters — normals, elites, and bosses. HP ranges, attack patterns, innate powers, and ascension scaling.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/monsters`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/monsters", languages: buildLanguageAlternates("/monsters") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
