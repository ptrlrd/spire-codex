import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "289+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.relics);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Relics - Complete Relic List - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Browse all ${count} Slay the Spire 2 (sts2) relics. Filter by rarity and character pool. View relic effects and images.`;
  return {
    title,
    description: `Every Slay the Spire 2 (sts2) relic — all ${count}. Filter by rarity (Common to Ancient) and character pool. Effects, flavor text, and shop prices.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/relics`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/relics", languages: buildLanguageAlternates("/relics") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
