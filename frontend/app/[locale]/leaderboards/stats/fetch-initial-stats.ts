import type { CommunityStats } from "./StatsClient";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Server-fetch the COMPACT stats payload so the initial HTML carries real
// numbers — Google stamped /leaderboards/stats Soft 404 because the only
// crawlable content was the client "Loading..." state. Compact matters:
// embedding the full payload put ~4MB of item tables into the RSC flight,
// and the client refetches the full payload on mount anyway, so the page
// shipped every byte twice. The overview renders from this; the deep tables
// fill in when the client fetch lands (their accessors are null-guarded).
export async function fetchInitialStats(): Promise<CommunityStats | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/stats?compact=1`, {
      next: { revalidate: 300 },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
