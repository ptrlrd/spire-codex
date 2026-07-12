const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface VoteOption {
  id: string;
  label: string;
  count: number;
  pct: number;
}
export interface EventVotes {
  total: number;
  options: VoteOption[];
}

interface CommunityEvent {
  id: string;
  name: string;
  total: number;
  options: VoteOption[];
}

/**
 * How the community actually votes at one event, server-side, so the choice
 * distribution ("33% chose Accept") renders into the SSR HTML. This is unique
 * data no wiki has. Sourced from the existing community-stats payload (which
 * already carries per-event choice breakdowns); Next dedupes the fetch across
 * all event pages, so it costs one shared cached request. Returns null for
 * events not yet tracked (beta-only, low volume) so the section just hides.
 */
export async function fetchEventVotes(eventId: string): Promise<EventVotes | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/community-stats`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: CommunityEvent[] };
    const want = eventId.toUpperCase();
    const ev = (data.events ?? []).find((e) => (e.id ?? "").toUpperCase() === want);
    if (!ev || !ev.total || !ev.options?.length) return null;
    return { total: ev.total, options: ev.options };
  } catch {
    return null;
  }
}
