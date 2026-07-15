"use client";

// API keys manager for the profile page. Create a key (the raw key is shown
// exactly once, with a copy button), list your keys, revoke them. Keys are sent
// as the X-API-Key header and carry a rate-limit tier; new keys get the
// registered tier.

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ApiKey {
  id: string;
  tier: string;
  label: string;
  created_at: string | null;
  last_used_at: string | null;
  requests_today: number;
  requests_week: number;
  revoked: boolean;
}

const TIER_LABELS: Record<string, string> = {
  general: "General",
  registered: "Registered",
  academia: "Academia",
  paid: "Paid",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString();
}

export default function ApiKeysSection() {
  const { lang } = useLanguage();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/keys`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: { keys: ApiKey[] }) => setKeys(d.keys ?? []))
      .catch(() => {
        // A failed load is not "you have no keys" - say so instead.
        setKeys([]);
        setError("Could not load your keys. Refresh to retry.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createKey = () => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE}/api/keys`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.detail || `${r.status}`);
        }
        return r.json();
      })
      .then((d: { raw_key: string }) => {
        setNewKey(d.raw_key);
        setCopied(false);
        setLabel("");
        load();
      })
      .catch((e) => setError(String((e as Error)?.message || e)))
      .finally(() => setBusy(false));
  };

  const revokeKey = (id: string) => {
    setBusy(true);
    fetch(`${API_BASE}/api/keys/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then(() => load())
      .finally(() => setBusy(false));
  };

  const copy = () => {
    if (!newKey) return;
    navigator.clipboard?.writeText(newKey).then(() => setCopied(true));
  };

  const active = (keys ?? []).filter((k) => !k.revoked);

  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
        {t("API Keys", lang)}
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-3 max-w-2xl">
        {t(
          "For scripts and tools that call the API directly. Send the key as the X-API-Key header to get your own rate limit instead of the shared per-IP cap.",
          lang,
        )}
      </p>

      {/* The raw key, shown exactly once after creation. */}
      {newKey && (
        <div className="mb-4 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/5 p-4">
          <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {t("Your new key", lang)}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mb-2">
            {t("Copy it now. For your security it is only shown this once.", lang)}
          </div>
          <div className="flex gap-2">
            <code className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] break-all">
              {newKey}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 px-3 py-2 rounded-lg text-sm border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
            >
              {copied ? t("Copied", lang) : t("Copy", lang)}
            </button>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="shrink-0 px-3 py-2 rounded-lg text-sm border border-[var(--border-subtle)] text-[var(--text-secondary)]"
            >
              {t("Done", lang)}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {/* Existing keys */}
      {keys === null ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : active.length > 0 ? (
        <div className="mb-4 rounded-lg border border-[var(--border-subtle)] overflow-hidden">
          {active.map((k) => (
            <div
              key={k.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0 bg-[var(--bg-card)]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)] truncate">
                  {k.label || t("Unnamed key", lang)}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {t("created", lang)} {fmtDate(k.created_at)} · {t("last used", lang)}{" "}
                  {fmtDate(k.last_used_at)}
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums text-xs">
                <div className="text-[var(--text-primary)]">
                  {(k.requests_today ?? 0).toLocaleString()} {t("today", lang)}
                </div>
                <div className="text-[var(--text-muted)]">
                  {(k.requests_week ?? 0).toLocaleString()} / 7d
                </div>
              </div>
              <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                {TIER_LABELS[k.tier] ?? k.tier}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => revokeKey(k.id)}
                className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 disabled:opacity-50"
              >
                {t("Revoke", lang)}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {t("No keys yet.", lang)}
        </p>
      )}

      {/* Create */}
      <div className="flex gap-2 max-w-md">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder={t("Label (e.g. my script)", lang)}
          className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={createKey}
          className="shrink-0 px-4 py-2 rounded-lg text-sm border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] disabled:opacity-50"
        >
          {t("Create key", lang)}
        </button>
      </div>
    </section>
  );
}
