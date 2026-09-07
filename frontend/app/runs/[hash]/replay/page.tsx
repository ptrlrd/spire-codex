import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
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

// Memoized per request so generateMetadata and the page share one fetch.
// Only a 404 means "no such run"; any other failure is an error, never a
// not-found page.
const fetchRun = cache(async (hash: string): Promise<ReplayRunInfo | null> => {
  const res = await fetch(`${API_INTERNAL}/api/runs/shared/${encodeURIComponent(hash)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`run API ${res.status} for ${hash}`);
  const body: unknown = await res.json();
  if (!body || typeof body !== "object") throw new Error(`run API returned no object for ${hash}`);
  return body as ReplayRunInfo;
});

function characterOf(run: ReplayRunInfo): string {
  const raw = run.players?.[run.player_index ?? 0]?.character ?? run.players?.[0]?.character ?? "";
  const bare = raw.replace("CHARACTER.", "");
  return bare ? bare.charAt(0) + bare.slice(1).toLowerCase() : "Unknown";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const run = await fetchRun(hash);
  if (!run || !run.has_replay) return { title: "Replay not found - Slay the Spire 2 (sts2) | Spire Codex", robots: { index: false } };
  const who = run.username?.trim() || "Anonymous";
  const result = run.win ? "win" : run.was_abandoned ? "abandoned" : "loss";
  return {
    title: `${who} - ${characterOf(run)} - Ascension ${run.ascension ?? 0} ${result} replay - Slay the Spire 2 (sts2) | Spire Codex`,
    description: `Step through every floor, reward, and combat turn of this Slay the Spire 2 run.`,
    alternates: { canonical: `/runs/${hash}/replay` },
    ...(run.hidden ? { robots: { index: false } } : {}),
  };
}

export default async function ReplayPage({ params }: Props) {
  const { hash } = await params;
  const run = await fetchRun(hash);
  if (!run || !run.has_replay) notFound();
  return <ReplayClient hash={hash} run={run} />;
}
