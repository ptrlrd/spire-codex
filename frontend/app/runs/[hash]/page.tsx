import type { Metadata } from "next";
import SharedRunClient from "./SharedRunClient";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ hash: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`);
    if (!res.ok) return { title: "Run Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const run = await res.json();
    const rawChar = run.players?.[0]?.character?.replace("CHARACTER.", "") || "Unknown";
    // Title-case the enum-style value ("NECROBINDER" → "Necrobinder").
    const char = rawChar.charAt(0) + rawChar.slice(1).toLowerCase();
    const result = run.win ? "win" : run.was_abandoned ? "abandoned" : "loss";
    const username = run.username?.trim() || "Anonymous";
    const ascension = run.ascension ?? 0;
    // Title format requested by user:
    //   "{username} - {character} - Ascension N win/loss - Slay the Spire 2 (sts2) | Spire Codex"
    return {
      title: `${username} - ${char} - Ascension ${ascension} ${result} - Slay the Spire 2 (sts2) | Spire Codex`,
      description: `${username}'s ${result === "win" ? "victorious" : result} ${char} run at Ascension ${ascension}. ${run.players?.[0]?.deck?.length || 0} cards, ${run.players?.[0]?.relics?.length || 0} relics.`,
    };
  } catch {
    return { title: "Run Viewer - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default function SharedRunPage() {
  return <SharedRunClient />;
}
