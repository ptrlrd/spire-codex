import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "63+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.potions);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Potions - Complete Potion List - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Browse all ${count} Slay the Spire 2 (sts2) potions. Filter by rarity and character pool.`;
  return {
    title,
    description: `Every Slay the Spire 2 (sts2) potion — all ${count}. Filter by rarity (Common, Uncommon, Rare) and character pool. Effects, shop prices, and use timing.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/potions`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/potions", languages: buildLanguageAlternates("/potions") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
