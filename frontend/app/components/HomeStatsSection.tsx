import HomeStatsLive from "./HomeStatsLive";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RUNS_HOST = "";
const RUNS_API = API;
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_BASE = PUBLIC_API;

const REVALIDATE = 300;

export interface CommunityStats {
  total_runs: number;
  total_wins: number;
  total_abandoned: number;
  win_rate: number;
  characters: { character: string; total: number; wins: number; abandoned?: number; win_rate: number }[];
}

async function loadStats(): Promise<CommunityStats | null> {
  try {
    const res = await fetch(`${RUNS_API}/api/runs/stats?compact=1`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as CommunityStats;
  } catch {
    return null;
  }
}

export default async function HomeStatsSection({
  lang = "eng",
  characterNames,
}: {
  lang?: string;
  characterNames?: Record<string, string>;
}) {
  const stats = await loadStats();
  if (!stats || stats.total_runs === 0) return null;

  return (
    <HomeStatsLive
      initialStats={stats}
      lang={lang}
      characterNames={characterNames}
      runsHost={RUNS_HOST}
      pollBase={POLL_BASE}
    />
  );
}
