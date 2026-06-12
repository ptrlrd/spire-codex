"use client";

// Cloudflare cache purge without leaving the lair: specific paths, or the
// whole zone. The token never reaches the browser - the backend holds
// CF_TOKEN/CF_ZONE and proxies the purge.

import { useState } from "react";
import { AdminShell, adminFetch } from "../shared";

export default function CacheClient() {
  const [paths, setPaths] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function purge(all: boolean) {
    const list = all
      ? []
      : paths
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
    if (all && !window.confirm("Purge the ENTIRE Cloudflare cache?")) return;
    if (!all && list.length === 0) {
      setNote("Enter at least one path, or use purge everything.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await adminFetch<{ ok: boolean; purged: string; count: number }>(
        "/api/admin/cf/purge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: list }) },
      );
      setNote(
        res.ok
          ? res.purged === "everything"
            ? "Purged the whole zone."
            : `Purged ${res.count} path(s).`
          : "Cloudflare rejected the purge; check the backend log.",
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Cache" subtitle="Cloudflare purge">
      <p className="text-sm text-[var(--text-secondary)] mb-3">
        One path per line, e.g. <code className="text-[var(--accent-gold)]">/cards</code> or{" "}
        <code className="text-[var(--accent-gold)]">/api/runs/community-stats</code>. Paths purge on
        the apex domain.
      </p>
      <textarea
        value={paths}
        onChange={(e) => setPaths(e.target.value)}
        rows={6}
        placeholder={"/cards\n/api/runs/community-stats"}
        className="w-full max-w-xl px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 mb-3"
      />
      <div className="flex gap-2">
        <button
          onClick={() => purge(false)}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          Purge paths
        </button>
        <button
          onClick={() => purge(true)}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-rose-950/60 text-rose-300 border border-rose-900/40 hover:bg-rose-900/60 disabled:opacity-50"
        >
          Purge everything
        </button>
      </div>
      {note && <p className="text-sm text-[var(--text-secondary)] mt-4">{note}</p>}
    </AdminShell>
  );
}
