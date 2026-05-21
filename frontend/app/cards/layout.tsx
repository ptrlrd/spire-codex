import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "576+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.cards);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Cards - Complete Card List - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Browse all ${count} Slay the Spire 2 (sts2) cards. Filter by character, type, rarity, and keywords.`;
  return {
    title,
    description: `Every Slay the Spire 2 (sts2) card — all ${count}. Filter by character, type, rarity, and keyword. Art, stats, upgrade text, and related cards.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/cards`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/cards", languages: buildLanguageAlternates("/cards") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
