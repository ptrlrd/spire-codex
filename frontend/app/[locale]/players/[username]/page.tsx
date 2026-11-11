import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import PlayerProfileClient from "./PlayerProfileClient";
import { lookupPlayer } from "@/lib/player-lookup";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ username: string }> };

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const findPlayer = cache(lookupPlayer);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const requested = decodeName((await params).username);
  const player = await findPlayer(requested);
  if (player.status === "missing") {
    return {
      title: `Player Not Found | ${SITE_NAME}`,
      robots: { index: false, follow: true },
    };
  }
  const name = player.status === "found" ? player.username : requested;
  const url = `${SITE_URL}/players/${encodeURIComponent(name)}`;
  const title = `${name} - Player Profile | Spire Codex`;
  const description = `${name}'s Slay the Spire 2 profile on Spire Codex: win rate and percentile, what kills them, campfire choices, card picks vs the community, and records.`;
  return {
    title,
    description,
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      url,
      title,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: url },
  };
}

export default async function PlayerPage({ params }: Props) {
  const requested = decodeName((await params).username);
  const player = await findPlayer(requested);
  if (player.status === "missing") notFound();
  return <PlayerProfileClient username={requested} />;
}
