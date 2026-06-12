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
  environment: string;
}

function fmtAge(seconds?: number | null): string {
  if (seconds == null) return "unknown";
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

export default function AdminClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e) => setError(String(e?.message || e)));
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        </>
      )}
    </AdminShell>
  );
}
