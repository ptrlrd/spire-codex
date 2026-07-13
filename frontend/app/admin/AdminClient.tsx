"use client";

// Operator overview: run volume, snapshot health, Redis. The shell handles
// the gate and the section nav; the other surfaces live in their own
// /admin/* routes.

import { useEffect, useState } from "react";
import { AdminShell, Card, adminFetch } from "./shared";

interface Overview {
  runs: { total?: number; last_24h?: number; last_submission?: string | null };
  users: { total?: number };
  snapshot: {
    built_at?: string | null;
    age_seconds?: number | null;
    version?: number | null;
    total_runs?: number | null;
    has_charts?: boolean;
  };
  redis: {
    enabled: boolean;
    ok: boolean;
    used_memory_human?: string;
    maxmemory_human?: string;
    keys?: number;
    hit_rate?: number | null;
    uptime_days?: number;
  };
  dau?: {
    today?: number;
    wau?: number;
    mau?: number;
    series?: { day: string; count: number }[];
  };
  environment: string;
}

interface LivePlayer {
  steam_id: string;
  username?: string | null;
  character?: string | null;
  ascension?: number | null;
  total_floor?: number | null;
  act?: string | null;
  session_seconds?: number | null;
}
interface LiveTotal {
  steam_id: string;
  username?: string | null;
  total_seconds: number;
  last_seen?: string | null;
}
interface Live {
  current: LivePlayer[];
  all_time: LiveTotal[];
  peak?: { value: number; at?: string | null } | null;
}

function fmtAge(seconds?: number | null): string {
  if (seconds == null) return "unknown";
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

function fmtDuration(seconds?: number | null): string {
  if (seconds == null || seconds < 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function fmtHours(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h).toLocaleString()}h` : `${h.toFixed(1)}h`;
}

function playerName(p: { username?: string | null; steam_id: string }): string {
  return p.username || `steam:${p.steam_id.slice(-6)}`;
}

export default function AdminClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [hoverDau, setHoverDau] = useState<number | null>(null);

  useEffect(() => {
    adminFetch<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  // Live roster changes by the second, so poll it on its own cadence.
  useEffect(() => {
    let alive = true;
    const load = () =>
      adminFetch<Live>("/api/admin/live")
        .then((d) => alive && setLive(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const r = data?.runs ?? {};
  const snap = data?.snapshot ?? {};
  const redis = data?.redis;

  const QUICK_LINKS = [
    { href: "https://analytics.spire-codex.com", label: "Umami" },
    { href: "https://github.com/ptrlrd/spire-codex", label: "GitHub" },
    { href: "https://dash.cloudflare.com", label: "Cloudflare" },
    { href: "https://git.ptrlrd.com", label: "Forgejo" },
    { href: "https://hub.docker.com/u/ptrlrd", label: "Docker Hub" },
  ];

  return (
    <AdminShell title="Admin" subtitle={data?.environment}>
      <div className="flex flex-wrap gap-2 mb-8">
        {QUICK_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-lg text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:border-[var(--accent-gold)]/40 transition-colors"
          >
            {l.label} ↗
          </a>
        ))}
      </div>

      {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}
      {!data && !error && (
        <p className="text-sm text-[var(--text-muted)]">Loading overview...</p>
      )}

      {data && (
        <>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">Runs</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Card label="Total runs" value={(r.total ?? 0).toLocaleString()} />
            <Card label="Last 24h" value={(r.last_24h ?? 0).toLocaleString()} />
            <Card
              label="Last submission"
              value={r.last_submission ? new Date(r.last_submission).toLocaleTimeString() : "-"}
              sub={r.last_submission ? new Date(r.last_submission).toLocaleDateString() : undefined}
            />
            <Card label="Users" value={(data.users.total ?? 0).toLocaleString()} />
          </div>

          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">Stats snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Card label="Rebuilt" value={fmtAge(snap.age_seconds)} />
            <Card label="Version" value={String(snap.version ?? "-")} />
            <Card label="Runs in snapshot" value={(snap.total_runs ?? 0).toLocaleString()} />
            <Card label="Chart cells" value={snap.has_charts === false ? "building" : "present"} />
          </div>

          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">Redis</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Card
              label="Status"
              value={!redis?.enabled ? "disabled" : redis.ok ? "up" : "down"}
            />
            <Card
              label="Memory"
              value={redis?.used_memory_human ?? "-"}
              sub={redis?.maxmemory_human ? `cap ${redis.maxmemory_human}` : undefined}
            />
            <Card label="Keys" value={(redis?.keys ?? 0).toLocaleString()} />
            <Card
              label="Hit rate"
              value={redis?.hit_rate != null ? `${redis.hit_rate}%` : "-"}
              sub={redis?.uptime_days != null ? `up ${redis.uptime_days}d` : undefined}
            />
          </div>

          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">
            Mod usage
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card label="Active today" value={(data.dau?.today ?? 0).toLocaleString()} />
            <Card
              label="Last 7 days"
              value={(data.dau?.wau ?? 0).toLocaleString()}
              sub="distinct players"
            />
            <Card
              label="Last 30 days"
              value={(data.dau?.mau ?? 0).toLocaleString()}
              sub="distinct players"
            />
          </div>
          {(data.dau?.series?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <div className="flex items-baseline justify-between mb-2 gap-3">
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Daily active, last {data.dau!.series!.length} days · Pacific
                </span>
                <span className="text-xs tabular-nums text-[var(--text-secondary)]">
                  {hoverDau != null && data.dau!.series![hoverDau]
                    ? `${data.dau!.series![hoverDau].day}: ${data.dau!.series![hoverDau].count.toLocaleString()} active`
                    : "hover a bar for the count"}
                </span>
              </div>
              <div className="flex items-end gap-1 h-20">
                {(() => {
                  const series = data.dau!.series!;
                  const max = Math.max(1, ...series.map((d) => d.count));
                  return series.map((d, i) => (
                    <div
                      key={d.day}
                      onMouseEnter={() => setHoverDau(i)}
                      onMouseLeave={() => setHoverDau((h) => (h === i ? null : h))}
                      title={`${d.day}: ${d.count} active`}
                      className={`flex-1 rounded-t cursor-default transition-colors ${
                        hoverDau === i
                          ? "bg-[var(--accent-gold)]"
                          : "bg-[var(--accent-gold)]/60"
                      }`}
                      style={{ height: `${Math.max(4, Math.round((d.count / max) * 100))}%` }}
                    />
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Live players — from the presence layer, polled ~20s */}
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mt-8 mb-3">
            Live players
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 md:col-span-2">
              <div className="flex items-baseline justify-between mb-3 gap-3">
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Currently live
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {(live?.current?.length ?? 0).toLocaleString()} playing now
                  {live?.peak?.value != null && (
                    <span
                      className="text-[var(--text-muted)]"
                      title={
                        live.peak.at
                          ? `peak set ${new Date(live.peak.at).toLocaleString()}`
                          : undefined
                      }
                    >
                      {" · peak "}
                      {live.peak.value.toLocaleString()} all-time
                    </span>
                  )}
                </span>
              </div>
              {live && live.current.length > 0 ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {live.current.map((p) => (
                    <div
                      key={p.steam_id}
                      className="flex items-center gap-3 py-2 text-sm"
                    >
                      <span className="text-[var(--text-primary)] truncate">
                        {playerName(p)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] truncate">
                        {[
                          p.character,
                          p.ascension != null ? `A${p.ascension}` : null,
                          p.total_floor != null ? `Floor ${p.total_floor}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="ml-auto tabular-nums text-[var(--text-secondary)]">
                        {fmtDuration(p.session_seconds)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Nobody&apos;s playing right now.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Longest sessions (live now)
              </div>
              {live && live.current.length > 0 ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {[...live.current]
                    .sort((a, b) => (b.session_seconds ?? 0) - (a.session_seconds ?? 0))
                    .slice(0, 8)
                    .map((p) => (
                      <div
                        key={p.steam_id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="text-[var(--text-primary)] truncate">
                          {playerName(p)}
                        </span>
                        <span className="tabular-nums text-[var(--text-secondary)]">
                          {fmtDuration(p.session_seconds)}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">&mdash;</p>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
                All-time live hours
              </div>
              {live && live.all_time.length > 0 ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {live.all_time.slice(0, 10).map((p, i) => (
                    <div
                      key={p.steam_id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="text-[var(--text-primary)] truncate">
                        <span className="mr-2 tabular-nums text-[var(--text-muted)]">
                          {i + 1}
                        </span>
                        {playerName(p)}
                      </span>
                      <span className="tabular-nums text-[var(--text-secondary)]">
                        {fmtHours(p.total_seconds)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  No live time recorded yet.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
