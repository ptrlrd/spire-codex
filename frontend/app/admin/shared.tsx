"use client";

// Shared plumbing for the operator pages: the admin gate (404 for anyone
// not on the allowlist), the section nav, and the card primitives. Every
// /admin/* page wraps itself in <AdminShell>; the real enforcement is
// server-side on /api/admin/* plus Cloudflare Access at the edge - this
// gate only keeps the UI from flashing for non-admins.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("spire_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string>) },
  });
  if (!res.ok) {
    // Surface the backend's `detail` (e.g. the Umami misconfig hint), not just
    // a bare status code, so the operator pages can show what to actually fix.
    let detail = "";
    try {
      const body = await res.json();
      if (body?.detail) detail = `: ${body.detail}`;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`${path} -> ${res.status}${detail}`);
  }
  return res.json();
}

interface Me {
  username: string | null;
  is_admin?: boolean;
}

// The gate verdict, cached for the tab's lifetime: without this every /admin/*
// navigation re-fetched /api/auth/me and blanked the page on "Loading..."
// before the page's own data fetch could even start. The gate is cosmetic
// (every /api/admin/* endpoint enforces require_admin server-side), so trusting
// a same-session verdict is safe; sign-out clears sessionStorage cookies-side
// and the API would 401 anyway.
let _gateMe: Me | null = null;

function cachedGate(): Me | null {
  if (_gateMe) return _gateMe;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("admin_gate_me");
    if (raw) {
      _gateMe = JSON.parse(raw) as Me;
      return _gateMe;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useAdminGate(): { state: "loading" | "denied" | "ok"; me: Me | null } {
  const cached = cachedGate();
  const [state, setState] = useState<"loading" | "denied" | "ok">(
    cached ? "ok" : "loading",
  );
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    if (cachedGate()) return;
    fetch(`${API}/api/auth/me`, { credentials: "include", headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Me | null) => {
        if (!m?.is_admin) {
          setState("denied");
          return;
        }
        _gateMe = m;
        try {
          sessionStorage.setItem("admin_gate_me", JSON.stringify(m));
        } catch {
          /* ignore */
        }
        setMe(m);
        setState("ok");
      })
      .catch(() => setState("denied"));
  }, []);
  return { state, me };
}

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">404</h1>
      <p className="text-sm text-[var(--text-muted)]">This page does not exist.</p>
    </div>
  );
}

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/guides", label: "Guides" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/news", label: "Site news" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/searches", label: "Searches" },
  { href: "/admin/cache", label: "Cache" },
  { href: "/admin/rate-limits", label: "Rate limits" },
  { href: "/admin/keys", label: "API keys" },
];

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { state, me } = useAdminGate();
  const pathname = usePathname();

  if (state === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center text-sm text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }
  if (state === "denied") return <NotFound />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-1">
        <span className="text-[var(--accent-gold)]">{title}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Signed in as {me?.username ?? "?"}
        {subtitle ? ` · ${subtitle}` : ""}
      </p>
      <nav className="flex flex-wrap gap-1.5 mb-8">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              pathname === s.href
                ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30"
                : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1">{label}</div>
      {sub && <div className="text-xs text-[var(--text-secondary)] mt-1">{sub}</div>}
    </div>
  );
}
