"use client";

// Operator control over the API's blanket per-IP cap. Reads/writes
// /api/admin/rate-limits; changes propagate to every worker within the config
// cache window (~15s). Per-endpoint limits (auth, feedback, ...) are untouched.

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";

interface Config {
  default_limit: string;
  enabled: boolean;
}

const PRESETS = ["60/minute", "120/minute", "300/minute", "600/minute", "5/second"];

export default function RateLimitsClient() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [limit, setLimit] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<Config>("/api/admin/rate-limits")
      .then((c) => {
        setCfg(c);
        setLimit(c.default_limit);
        setEnabled(c.enabled);
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }, []);

  const save = (patch: Partial<Config>) => {
    setSaving(true);
    setNote(null);
    adminFetch<Config>("/api/admin/rate-limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((c) => {
        setCfg(c);
        setLimit(c.default_limit);
        setEnabled(c.enabled);
        setNote("Saved. Live across all workers within ~15s.");
      })
      .catch((e) => setNote(String((e as Error)?.message || e)))
      .finally(() => setSaving(false));
  };

  return (
    <AdminShell title="Rate limits" subtitle="blanket per-IP cap">
      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
        The blanket per-IP cap every endpoint falls back to. Endpoints with their own
        tighter limit (auth, feedback, guide submission) keep it. Changes go live across
        all workers within ~15 seconds, no redeploy.
      </p>

      {note && <p className="text-sm text-[var(--text-secondary)] mb-4">{note}</p>}

      {cfg === null && !note && (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      )}

      {cfg && (
        <div className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Blanket limit {enabled ? "on" : "off"}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                Off leaves only the per-endpoint limits (auth etc.).
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ enabled: !enabled })}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                enabled
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                  : "bg-red-500/15 border-red-500/40 text-red-400"
              }`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
              Requests per IP
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="300/minute"
                className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
              />
              <button
                type="button"
                disabled={saving || !limit.trim()}
                onClick={() => save({ default_limit: limit.trim() })}
                className="px-4 py-2 rounded-lg text-sm border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setLimit(p);
                    save({ default_limit: p });
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                    cfg.default_limit === p
                      ? "border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Format <span className="font-mono">count/period</span> — e.g. 300/minute,
              5/second, 10000/hour.
            </p>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
