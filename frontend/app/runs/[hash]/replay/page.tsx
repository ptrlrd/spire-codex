import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReplayClient from "./ReplayClient";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ hash: string }> };

export interface ReplayRunInfo {
  username?: string | null;
  ascension?: number;
  win?: boolean;
  was_abandoned?: boolean;
  run_time?: number;
  has_replay?: boolean;
  hidden?: boolean;
  player_index?: number;
  build_id?: string;
  players?: { character?: string }[];
}

async function fetchRun(hash: string): Promise<ReplayRunInfo | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ReplayRunInfo;
  } catch {
    return null;
  }
}

function characterOf(run: ReplayRunInfo): string {
  const raw = run.players?.[run.player_index ?? 0]?.character ?? run.players?.[0]?.character ?? "";
  const bare = raw.replace("CHARACTER.", "");
  return bare ? bare.charAt(0) + bare.slice(1).toLowerCase() : "Unknown";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const run = await fetchRun(hash);
  if (!run || !run.has_replay) return { title: "Replay not found - Slay the Spire 2 (sts2) | Spire Codex" };
  const who = run.username?.trim() || "Anonymous";
  const result = run.win ? "win" : run.was_abandoned ? "abandoned" : "loss";
  return {
    title: `${who} - ${characterOf(run)} - Ascension ${run.ascension ?? 0} ${result} replay - Slay the Spire 2 (sts2) | Spire Codex`,
    description: `Step through every floor, reward, and combat turn of this Slay the Spire 2 run.`,
    alternates: { canonical: `/runs/${hash}/replay` },
  };
}

export default async function ReplayPage({ params }: Props) {
  const { hash } = await params;
  const run = await fetchRun(hash);
  if (!run || !run.has_replay) notFound();
  return <ReplayClient hash={hash} run={run} />;
}
