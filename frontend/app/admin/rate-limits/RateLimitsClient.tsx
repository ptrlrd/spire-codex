"use client";

// Operator control over the API rate limits: the un-keyed browse cap (per IP)
// and the per-API-key tier caps. Reads/writes /api/admin/rate-limits; changes
// propagate to every worker within the config cache window (~15s). Per-endpoint
// limits (auth, feedback, ...) are untouched.

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";

interface Override {
  path: string;
  limit: string;
}

interface Config {
  default_limit: string;
  tiers: Record<string, string>;
  overrides: Override[];
  enabled: boolean;
}

const PRESETS = ["60/minute", "120/minute", "300/minute", "600/minute", "5/second"];

const TIER_META: { key: string; label: string; hint: string }[] = [
  { key: "general", label: "General", hint: "any issued key" },
  { key: "registered", label: "Registered", hint: "account holders" },
  { key: "academia", label: "Academia", hint: "granted" },
  { key: "paid", label: "Paid", hint: "Patreon" },
];

export default function RateLimitsClient() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [limit, setLimit] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = (c: Config) => {
    setCfg(c);
    setLimit(c.default_limit);
    setEnabled(c.enabled);
    setTiers(c.tiers || {});
    setOverrides(c.overrides || []);
  };

  useEffect(() => {
    adminFetch<Config>("/api/admin/rate-limits")
      .then(apply)
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
        apply(c);
        setNote("Saved. Live across all workers within ~15s.");
      })
      .catch((e) => setNote(String((e as Error)?.message || e)))
      .finally(() => setSaving(false));
  };

  const card = "rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";
  const input =
    "rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm font-mono text-[var(--text-primary)]";
  const goldBtn =
    "px-4 py-2 rounded-lg text-sm border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] disabled:opacity-50";

  return (
    <AdminShell title="Rate limits" subtitle="browse cap + API-key tiers">
      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
        Un-keyed traffic (the website + anonymous) is capped per IP by the browse limit.
        Requests with an <span className="font-mono">X-API-Key</span> get their key&apos;s
        tier cap instead. Tighter per-endpoint limits (auth, feedback) always apply on top.
        Changes go live across all workers within ~15 seconds, no redeploy.
      </p>

      {note && <p className="text-sm text-[var(--text-secondary)] mb-4">{note}</p>}
      {cfg === null && !note && (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      )}

      {cfg && (
        <div className="space-y-4 max-w-lg">
          <div className={`flex items-center justify-between ${card}`}>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Limiting {enabled ? "on" : "off"}
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

          <div className={card}>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Browse cap
            </label>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              Un-keyed traffic, per IP, counted per endpoint.
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="300/minute"
                className={`flex-1 ${input}`}
              />
              <button
                type="button"
                disabled={saving || !limit.trim()}
                onClick={() => save({ default_limit: limit.trim() })}
                className={goldBtn}
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
          </div>

          <div className={card}>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              API-key tiers
            </label>
            <div className="text-xs text-[var(--text-muted)] mb-3">
              Cap per <span className="font-mono">X-API-Key</span>, by the key&apos;s tier, counted per endpoint.
            </div>
            <div className="space-y-2">
              {TIER_META.map((t) => (
                <div key={t.key} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <div className="text-sm text-[var(--text-primary)]">{t.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{t.hint}</div>
                  </div>
                  <input
                    type="text"
                    value={tiers[t.key] ?? ""}
                    onChange={(e) => setTiers({ ...tiers, [t.key]: e.target.value })}
                    placeholder="60/minute"
                    className={`flex-1 ${input}`}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ tiers })}
              className={`mt-3 ${goldBtn}`}
            >
              Save tiers
            </button>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Format <span className="font-mono">count/period</span> — e.g. 300/minute,
              5/second, 10000/hour.
            </p>
          </div>

          <div className={card}>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Endpoint clamps
            </label>
            <div className="text-xs text-[var(--text-muted)] mb-3">
              Clamp a path prefix when it&apos;s being abused. Longest matching prefix
              wins and applies to everyone, keyed or not. <span className="font-mono">/api/admin</span>{" "}
              can&apos;t be clamped.
            </div>
            <div className="space-y-2">
              {overrides.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={o.path}
                    onChange={(e) => {
                      const next = [...overrides];
                      next[i] = { ...o, path: e.target.value };
                      setOverrides(next);
                    }}
                    placeholder="/api/runs"
                    className={`flex-1 ${input}`}
                  />
                  <input
                    type="text"
                    value={o.limit}
                    onChange={(e) => {
                      const next = [...overrides];
                      next[i] = { ...o, limit: e.target.value };
                      setOverrides(next);
                    }}
                    placeholder="30/minute"
                    className={`w-36 ${input}`}
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}
                    className="px-2.5 py-2 rounded-lg text-sm border border-red-500/40 bg-red-500/10 text-red-400 disabled:opacity-50"
                    aria-label="Remove clamp"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {overrides.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  No clamps active. Everything uses the browse cap / tier caps.
                </p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setOverrides([...overrides, { path: "", limit: "" }])}
                className="px-4 py-2 rounded-lg text-sm border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                Add clamp
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => save({ overrides: overrides.filter((o) => o.path.trim() && o.limit.trim()) })}
                className={goldBtn}
              >
                Save clamps
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
