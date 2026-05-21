import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "66";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.events);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  const title = "Events - All In-Game Events - Slay the Spire 2 (sts2) | Spire Codex";
  const ogDesc = `Slay the Spire 2 (sts2) events — browse all ${count} shrine events, Ancient encounters, and story events with choices, dialogue, and outcomes.`;
  return {
    title,
    description: `All ${count} Slay the Spire 2 (sts2) events — shrines, Ancients, and story beats. Choices, dialogue, relic offerings, and every outcome path.`,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/events`,
      title,
      description: ogDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: ogDesc },
    alternates: { canonical: "/events", languages: buildLanguageAlternates("/events") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
