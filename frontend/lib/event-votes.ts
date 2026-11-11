const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const EVENT_VOTES_BRACKET = "all";

export interface VoteOption {
  id: string;
  label: string;
  count: number;
  pct: number;
  winRate?: number | null;
  lift?: number | null;
}
export interface EventVotes {
  total: number;
  options: VoteOption[];
  hasOutcomes?: boolean;
  dataThrough?: string | null;
}

interface CommunityEvent {
  id: string;
  name: string;
  total: number;
  options: VoteOption[];
}

export interface EventMetricsRow {
  event?: string;
  option?: string;
  chosen?: number;
  share?: number | null;
  win_rate?: number | null;
  lift?: number | null;
}

interface EventMetrics {
  data_through?: string | null;
  rows?: EventMetricsRow[];
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_INTERNAL}${path}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function withOutcomes(
  votes: EventVotes,
  eventId: string,
  rows: EventMetricsRow[] | null | undefined,
): EventVotes {
  const want = eventId.toUpperCase();
  const byOption = new Map<string, EventMetricsRow>();
  for (const r of rows ?? [])
    if ((r.event ?? "").toUpperCase() === want && r.option)
      byOption.set(r.option.toUpperCase(), r);
  if (!byOption.size) return votes;
  const all = votes.options.every((o) => byOption.has(o.id.toUpperCase()));
  const options = votes.options.map((o) => {
    const m = byOption.get(o.id.toUpperCase());
    if (!m) return o;
    return {
      ...o,
      count: all && typeof m.chosen === "number" ? m.chosen : o.count,
      pct: all && typeof m.share === "number" ? m.share : o.pct,
      winRate: typeof m.win_rate === "number" ? m.win_rate : null,
      lift: typeof m.lift === "number" ? m.lift : null,
    };
  });
  return {
    total: all ? options.reduce((n, o) => n + o.count, 0) : votes.total,
    options,
    hasOutcomes: options.some((o) => typeof o.winRate === "number"),
  };
}

/**
 * How the community actually votes at one event, server-side, so the choice
 * distribution ("33% chose Accept") renders into the SSR HTML, with the win
 * rate and lift of each option from the all-runs events table beside it.
 * Returns null for events not yet tracked (beta-only, low volume) so the
 * section just hides.
 */
export async function fetchEventVotes(
  eventId: string,
): Promise<EventVotes | null> {
  const [data, metrics] = await Promise.all([
    getJson<{ events?: CommunityEvent[] }>("/api/runs/community-stats"),
    getJson<EventMetrics>(
      `/api/runs/metrics/events?bracket=${EVENT_VOTES_BRACKET}`,
    ),
  ]);
  if (!data) return null;
  const want = eventId.toUpperCase();
  const ev = (data.events ?? []).find(
    (e) => (e.id ?? "").toUpperCase() === want,
  );
  if (!ev || !ev.total || !ev.options?.length) return null;
  return {
    ...withOutcomes(
      { total: ev.total, options: ev.options },
      eventId,
      metrics?.rows,
    ),
    dataThrough: metrics?.data_through ?? null,
  };
}
