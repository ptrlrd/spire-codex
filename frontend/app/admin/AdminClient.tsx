"use client";

// Operator dashboard shell. Renders a 404-style screen unless /api/auth/me
// says the signed-in user is on the admin allowlist; the data itself comes
// from /api/admin/* which enforces the same allowlist server-side.

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Me {
  username: string | null;
  is_admin?: boolean;
}

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

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("spire_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">404</h1>
      <p className="text-sm text-[var(--text-muted)]">This page does not exist.</p>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1">{label}</div>
      {sub && <div className="text-xs text-[var(--text-secondary)] mt-1">{sub}</div>}
    </div>
  );
}

function fmtAge(seconds?: number | null): string {
  if (seconds == null) return "unknown";
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

export default function AdminClient() {
  const [state, setState] = useState<"loading" | "denied" | "ok">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: "include", headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Me | null) => {
        if (!m?.is_admin) {
          setState("denied");
          return;
        }
        setMe(m);
        setState("ok");
        return fetch(`${API}/api/admin/overview`, {
          credentials: "include",
          headers: authHeaders(),
        })
          .then((r) => {
            if (!r.ok) throw new Error(`overview ${r.status}`);
            return r.json();
          })
          .then(setData);
      })
      .catch((e) => {
        if (state !== "denied") setError(String(e?.message || e));
        setState((s) => (s === "loading" ? "denied" : s));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center text-sm text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }
  if (state === "denied") return <NotFound />;

  const r = data?.runs ?? {};
  const snap = data?.snapshot ?? {};
  const redis = data?.redis;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-1">
        <span className="text-[var(--accent-gold)]">Admin</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Signed in as {me?.username ?? "?"} · {data?.environment ?? "..."}
      </p>

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
    </div>
  );
}
