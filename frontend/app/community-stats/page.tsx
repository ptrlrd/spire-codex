import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import { normalizeBracket } from "@/lib/content-brackets";
import { CommunityStatsBody } from "./CommunityStatsBody";

// Community stats rebuild on the backend on the snapshot cadence; a 5min
// HTML cache keeps this page cheap without going stale.
export const revalidate = 300;

export const metadata: Metadata = {
  title: `Community Stats - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "Fun community stats for Slay the Spire 2 (sts2): how players vote at every event, what kills runs most, win rates by ascension and character, and run records, all from community-submitted runs.",
  alternates: { canonical: `${SITE_URL}/community-stats`, languages: buildLanguageAlternates("/community-stats") },
  openGraph: {
    title: `Slay the Spire 2 (sts2) Community Stats | ${SITE_NAME}`,
    description:
      "Player decision breakdowns, deadliest enemies, win rates, and records from community-submitted Slay the Spire 2 runs.",
    url: `${SITE_URL}/community-stats`,
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title: `Slay the Spire 2 (sts2) Community Stats | ${SITE_NAME}` },
};

// Base English route. Localized copies live at /[lang]/community-stats and
// render the same CommunityStatsBody with the URL language.
export default async function CommunityStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ bracket?: string }>;
}) {
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang="eng" bracket={bracket} />;
}
