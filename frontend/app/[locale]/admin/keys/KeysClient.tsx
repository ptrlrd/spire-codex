"use client";

// Operator view of every API key: who owns it, its tier, when it was last
// used. Change a key's tier from the dropdown (this is how academia / paid get
// granted until Patreon automates paid), or revoke it outright.

import { useCallback, useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";
import { fmtDate } from "@/lib/pacific";

interface AdminKey {
  id: string;
  user_id: string;
  username: string;
  tier: string;
  label: string;
  created_at: string | null;
  last_used_at: string | null;
  requests_today: number;
  requests_week: number;
  revoked: boolean;
}

interface KeysResponse {
  keys: AdminKey[];
  tiers: string[];
}

function fmt(iso: string | null): string {
  if (!iso) return "never";
  return fmtDate(iso);
}

const TIER_BADGE: Record<string, string> = {
  general: "text-[var(--text-secondary)] border-[var(--border-subtle)]",
  registered: "text-[var(--text-primary)] border-[var(--border-subtle)]",
  academia: "text-blue-400 border-blue-500/40",
  paid: "text-[var(--accent-gold)] border-[var(--accent-gold)]/40",
};

export default function KeysClient() {
  const [data, setData] = useState<KeysResponse | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const load = useCallback((query: string) => {
    adminFetch<KeysResponse>(
      `/api/admin/keys?limit=300${query ? `&q=${encodeURIComponent(query)}` : ""}`,
    )
      .then((d) => {
        setData(d);
        setNote(null);
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }, []);

  // Debounced server-side search.
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const setTier = (key: AdminKey, tier: string) => {
    if (tier === key.tier) return;
    setBusy(key.id);
    adminFetch(`/api/admin/keys/${key.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    })
      .then(() => load(q.trim()))
      .catch((e) => setNote(String((e as Error)?.message || e)))
      .finally(() => setBusy(null));
  };

  const revoke = (key: AdminKey) => {
    setBusy(key.id);
    adminFetch(`/api/admin/keys/${key.id}`, { method: "DELETE" })
      .then(() => load(q.trim()))
      .catch((e) => setNote(String((e as Error)?.message || e)))
      .finally(() => setBusy(null));
  };

  const keys = (data?.keys ?? []).filter((k) => showRevoked || !k.revoked);
  const tiers = data?.tiers ?? ["general", "registered", "academia", "paid"];

  return (
    <AdminShell title="API keys" subtitle="tiers + revocation">
      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
        Every issued key. Move a key to another tier from the dropdown (academia is
        granted here; paid will come from Patreon), or revoke it. Changes are live
        within seconds.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search username, label, or id…"
          className="w-72 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
          />
          Show revoked
        </label>
        {data && (
          <span className="text-xs text-[var(--text-muted)]">
            {keys.length} key{keys.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {note && <p className="text-sm text-red-400 mb-4">{note}</p>}
      {data === null && !note && (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      )}

      {data && keys.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No keys match.</p>
      )}

      {keys.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
          {keys.map((k) => (
            <div
              key={k.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0 bg-[var(--bg-card)] ${
                k.revoked ? "opacity-50" : ""
              }`}
            >
              <div className="flex-1 min-w-[10rem]">
                <div className="text-sm text-[var(--text-primary)] truncate">
                  {k.username || <span className="text-[var(--text-muted)]">unknown user</span>}
                  {k.label && (
                    <span className="text-[var(--text-muted)]"> · {k.label}</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] font-mono">
                  {k.id} · created {fmt(k.created_at)} · last used {fmt(k.last_used_at)}
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <div className="text-sm text-[var(--text-primary)]">
                  {(k.requests_today ?? 0).toLocaleString()}
                  <span className="text-xs text-[var(--text-muted)]"> today</span>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {(k.requests_week ?? 0).toLocaleString()} / 7d
                </div>
              </div>
              {k.revoked ? (
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-red-500/40 text-red-400">
                  revoked
                </span>
              ) : (
                <>
                  <select
                    value={k.tier}
                    disabled={busy === k.id}
                    onChange={(e) => setTier(k, e.target.value)}
                    className={`shrink-0 text-xs px-2 py-1 rounded-lg border bg-[var(--bg-primary)] disabled:opacity-50 ${TIER_BADGE[k.tier] ?? TIER_BADGE.general}`}
                  >
                    {tiers.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy === k.id}
                    onClick={() => revoke(k)}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
