import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "66";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.events);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return {
    title: "Events - All In-Game Events - Slay the Spire 2 (sts2) | Spire Codex",
    description: `Slay the Spire 2 (sts2) events — browse all ${count} shrine events, Ancient encounters, and story events. View choices, dialogue, relic offerings, and outcomes for every event.`,
    openGraph: {
      title: "Events - All In-Game Events - Slay the Spire 2 (sts2) | Spire Codex",
      description: `Slay the Spire 2 (sts2) events — browse all ${count} shrine events, Ancient encounters, and story events with choices, dialogue, and outcomes.`,
    },
    alternates: { canonical: "/events", languages: buildLanguageAlternates("/events") },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
