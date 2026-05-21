import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "260";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.powers);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Powers - Complete Power List - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Browse all ${count} Slay the Spire 2 (sts2) powers — buffs, debuffs, and neutral effects. Filter by type and stack behavior.`;
  return {
    title,
    description: `All ${count} Slay the Spire 2 (sts2) powers — buffs, debuffs, and neutral effects. Filter by type and stack behavior. Icons and full descriptions.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/powers`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/powers", languages: buildLanguageAlternates("/powers") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
