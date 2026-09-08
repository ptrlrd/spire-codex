import type { Metadata } from "next";
import PlayerProfileClient from "./PlayerProfileClient";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const name = decodeURIComponent(username);
  const title = `${name} - Player Profile | Spire Codex`;
  const description = `${name}'s Slay the Spire 2 profile on Spire Codex: win rate and percentile, what kills them, campfire choices, card picks vs the community, and records.`;
  return {
    title,
    description,
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      url: `${SITE_URL}/players/${username}`,
      title,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `/players/${username}` },
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <PlayerProfileClient username={decodeURIComponent(username)} />;
}
