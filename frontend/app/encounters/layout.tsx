import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "87";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.encounters);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Encounters - All Combat Encounters - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Slay the Spire 2 (sts2) encounters — browse all ${count} combat encounters including normal fights, elites, and bosses.`;
  return {
    title,
    description: `All ${count} Slay the Spire 2 (sts2) encounters — normal fights, elites, and bosses. Monster compositions, act placement, and room types.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/encounters`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/encounters", languages: buildLanguageAlternates("/encounters") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
