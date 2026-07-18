import { IS_BETA } from "@/lib/seo";
import HomeLeaderboardLive from "./HomeLeaderboardLive";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Beta has run submissions disabled, so its local runs data is essentially
// empty. Fetch leaderboard + recent-runs data from stable instead so the
// section actually has content to show; in-page links point at stable too.
const RUNS_HOST = IS_BETA ? "https://spire-codex.com" : "";
const RUNS_API = IS_BETA ? "https://spire-codex.com" : API;
// Browser-side polling must use the PUBLIC API base; API_INTERNAL_URL only
// resolves inside the Docker network during server render.
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_BASE = IS_BETA ? "https://spire-codex.com" : PUBLIC_API;

const REVALIDATE = 300;
const TARGET_ASCENSION = 10;

export interface RunRow {
  run_hash: string;
  character: string;
  win: number;
  was_abandoned?: number;
  ascension: number;
  run_time: number;
  floors_reached: number;
  username: string | null;
  killed_by: string | null;
  submitted_at: string;
}

export interface FastestBlock {
  runs: RunRow[];
  ascension: number | null;
}

interface RunListResponse {
  runs: RunRow[];
  total: number;
}

async function loadFastestWins(): Promise<FastestBlock> {
  try {
    const res = await fetch(
      `${RUNS_API}/api/runs/leaderboard?category=fastest&ascension_min=${TARGET_ASCENSION}&limit=5`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return { runs: [], ascension: null };
    const data = (await res.json()) as { runs: RunRow[] };
    const runs = (data.runs || []).filter((r) => r.win === 1).slice(0, 5);
    return { runs, ascension: runs.length ? TARGET_ASCENSION : null };
  } catch {
    return { runs: [], ascension: null };
  }
}

async function loadRecentRuns(): Promise<RunRow[]> {
  try {
    const res = await fetch(`${RUNS_API}/api/runs/list?limit=5&sort=newest`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as RunListResponse;
    return data.runs ?? [];
  } catch {
    return [];
  }
}

async function loadDailyClimb(): Promise<RunRow[]> {
  try {
    const res = await fetch(
      `${RUNS_API}/api/runs/leaderboard?category=highest_ascension&game_mode=daily&today=true&limit=5`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { runs: RunRow[] };
    return (data.runs ?? []).slice(0, 5);
  } catch {
    return [];
  }
}

export default async function HomeLeaderboardSection({
  langPrefix = "",
  lang = "eng",
  characterNames,
}: {
  langPrefix?: string;
  lang?: string;
  characterNames?: Record<string, string>;
}) {
  const [fastest, daily, recent] = await Promise.all([
    loadFastestWins(),
    loadDailyClimb(),
    loadRecentRuns(),
  ]);
  if (fastest.runs.length === 0 && daily.length === 0 && recent.length === 0)
    return null;

  return (
    <HomeLeaderboardLive
      initialFastest={fastest}
      initialDaily={daily}
      initialRecent={recent}
      langPrefix={langPrefix}
      lang={lang}
      characterNames={characterNames}
      runsHost={RUNS_HOST}
      pollBase={POLL_BASE}
    />
  );
}
