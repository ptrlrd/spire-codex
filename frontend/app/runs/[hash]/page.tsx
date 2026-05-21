import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import SharedRunClient from "./SharedRunClient";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ hash: string }> };

interface SharedRun {
  win?: boolean;
  was_abandoned?: boolean;
  username?: string | null;
  ascension?: number;
  players?: { character?: string; deck?: unknown[]; relics?: unknown[] }[];
}

async function fetchRun(hash: string): Promise<SharedRun | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`);
    if (!res.ok) return null;
    return (await res.json()) as SharedRun;
  } catch {
    return null;
  }
}

function describeRun(run: SharedRun) {
  const rawChar = run.players?.[0]?.character?.replace("CHARACTER.", "") || "Unknown";
  const char = rawChar.charAt(0) + rawChar.slice(1).toLowerCase();
  const result = run.win ? "win" : run.was_abandoned ? "abandoned" : "loss";
  const username = run.username?.trim() || "Anonymous";
  const ascension = run.ascension ?? 0;
  return { char, result, username, ascension };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const run = await fetchRun(hash);
  if (!run) return { title: "Run Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
  const { char, result, username, ascension } = describeRun(run);
  // Title format requested by user:
  //   "{username} - {character} - Ascension N win/loss - Slay the Spire 2 (sts2) | Spire Codex"
  const title = `${username} - ${char} - Ascension ${ascension} ${result} - Slay the Spire 2 (sts2) | Spire Codex`;
  const description = `${username}'s ${result === "win" ? "victorious" : result} ${char} run at Ascension ${ascension}. ${run.players?.[0]?.deck?.length || 0} cards, ${run.players?.[0]?.relics?.length || 0} relics.`;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: `${SITE_URL}/runs/${hash}`,
      title,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `/runs/${hash}`, languages: buildLanguageAlternates(`/runs/${hash}`) },
  };
}

export default async function SharedRunPage({ params }: Props) {
  const { hash } = await params;
  const run = await fetchRun(hash);
  let jsonLd: ReturnType<typeof buildDetailPageJsonLd> | null = null;
  if (run) {
    const { char, result, username, ascension } = describeRun(run);
    jsonLd = buildDetailPageJsonLd({
      name: `${username} - ${char} - Ascension ${ascension} ${result}`,
      description: `${username}'s ${result === "win" ? "victorious" : result} ${char} run at Ascension ${ascension} in Slay the Spire 2.`,
      path: `/runs/${hash}`,
      category: "Run",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Leaderboards", href: "/leaderboards" },
        { name: `${username} - ${char}`, href: `/runs/${hash}` },
      ],
    });
  }
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <SharedRunClient />
    </>
  );
}
