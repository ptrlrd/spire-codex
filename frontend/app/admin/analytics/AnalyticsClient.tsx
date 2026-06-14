"use client";

// Umami headline numbers without leaving the lair, proxied server-side so
// the analytics credentials never reach the browser. The full dashboard is
// one click away.

import { useEffect, useState } from "react";
import { AdminShell, Card, adminFetch } from "../shared";

interface UmamiStat {
  value?: number;
  prev?: number;
}
interface Analytics {
  active?: number;
  last_24h?: { pageviews?: UmamiStat; visitors?: UmamiStat; visits?: UmamiStat } | null;
  last_7d?: { pageviews?: UmamiStat; visitors?: UmamiStat; visits?: UmamiStat } | null;
  top_pages?: { x: string; y: number }[];
  dashboard_url?: string;
}

function n(stat?: UmamiStat): string {
  return stat?.value != null ? stat.value.toLocaleString() : "-";
}

export default function AnalyticsClient() {
  const [data, setData] = useState<Analytics | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      adminFetch<Analytics>("/api/admin/analytics")
        .then((d) => {
          if (!alive) return;
          setData(d);
          setNote(null);
        })
        .catch((e) => {
          if (!alive) return;
          const msg = String((e as Error)?.message || e);
          setNote(
            msg.includes("503")
              ? "Umami isn't wired up yet: set UMAMI_USERNAME and UMAMI_PASSWORD in the box .env (UMAMI_URL defaults to http://umami:3000) and redeploy."
              : msg,
          );
        });
    load();
    // Re-poll so the active-now figure stays realtime.
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <AdminShell title="Analytics" subtitle="Umami">
      {note && <p className="text-sm text-[var(--text-secondary)] mb-4">{note}</p>}

      {data && (
        <>
          <div className="mb-6">
            <a
              href={data.dashboard_url || "https://analytics.spire-codex.com"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--accent-gold)] hover:underline"
            >
              Open the full Umami dashboard →
            </a>
          </div>

          <div className="mb-8 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              <div>
                <div className="text-2xl font-bold tabular-nums text-emerald-400">
                  {(data.active ?? 0).toLocaleString()}
                </div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Active now
                </div>
              </div>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              visitors in the last 5 min · refreshes every 30s
            </span>
          </div>

          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">Last 24 hours</h2>
          <div className="grid grid-cols-3 gap-3 mb-8">
            <Card label="Visitors" value={n(data.last_24h?.visitors)} />
            <Card label="Visits" value={n(data.last_24h?.visits)} />
            <Card label="Pageviews" value={n(data.last_24h?.pageviews)} />
          </div>

          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">Last 7 days</h2>
          <div className="grid grid-cols-3 gap-3 mb-8">
            <Card label="Visitors" value={n(data.last_7d?.visitors)} />
            <Card label="Visits" value={n(data.last_7d?.visits)} />
            <Card label="Pageviews" value={n(data.last_7d?.pageviews)} />
          </div>

          {(data.top_pages?.length ?? 0) > 0 && (
            <>
              <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">
                Top pages (7d)
              </h2>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
                {data.top_pages!.map((p) => (
                  <div key={p.x} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-mono text-xs text-[var(--text-primary)] truncate">{p.x}</span>
                    <span className="text-[var(--text-secondary)] tabular-nums ml-3">
                      {p.y.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </AdminShell>
  );
}
