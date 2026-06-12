"use client";

// Run admin: search by username / seed / hash, inspect, delete. Deletion
// removes the Mongo docs and the blob file immediately; aggregates drop
// the run on their next rebuild.

import { useState } from "react";
import Link from "next/link";
import { AdminShell, adminFetch } from "../shared";

interface RunRow {
  run_hash?: string;
  username?: string | null;
  character?: string | null;
  ascension?: number | null;
  win?: boolean | number | null;
  player_count?: number | null;
  build_id?: string | null;
  submitted_at?: string | null;
  seed?: string | null;
}

export default function RunsClient() {
  const [username, setUsername] = useState("");
  const [seed, setSeed] = useState("");
  const [hash, setHash] = useState("");
  const [rows, setRows] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setNote(null);
    try {
      const params = new URLSearchParams();
      if (username.trim()) params.set("username", username.trim());
      if (seed.trim()) params.set("seed", seed.trim());
      if (hash.trim()) params.set("run_hash", hash.trim());
      const data = await adminFetch<{ runs: RunRow[]; total?: number }>(
        `/api/admin/runs/search?${params}`,
      );
      setRows(data.runs ?? []);
      if (!(data.runs ?? []).length) setNote("No runs matched.");
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(runHash: string) {
    if (!window.confirm(`Delete run ${runHash}? This removes it permanently.`)) return;
    try {
      const res = await adminFetch<{ deleted_docs: number; file_removed: boolean }>(
        `/api/admin/runs/${runHash}`,
        { method: "DELETE" },
      );
      setRows((prev) => prev.filter((r) => r.run_hash !== runHash));
      setNote(`Deleted ${runHash}: ${res.deleted_docs} doc(s), file removed: ${String(res.file_removed)}.`);
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  const inputClass =
    "px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50";

  return (
    <AdminShell title="Runs" subtitle="search, inspect, delete">
      <div className="flex flex-wrap gap-2 mb-4">
        <input className={inputClass} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className={inputClass} placeholder="Seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
        <input className={`${inputClass} w-72`} placeholder="Run hash" value={hash} onChange={(e) => setHash(e.target.value)} />
        <button
          onClick={search}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Searching..." : "Search"}
        </button>
      </div>

      {note && <p className="text-sm text-[var(--text-secondary)] mb-4">{note}</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-card)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Hash</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Character</th>
                <th className="px-3 py-2">Asc</th>
                <th className="px-3 py-2">Win</th>
                <th className="px-3 py-2">Build</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.run_hash} className="border-t border-[var(--border-subtle)]">
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.run_hash ? (
                      <Link href={`/runs/${r.run_hash}`} className="text-[var(--accent-gold)] hover:underline">
                        {r.run_hash.slice(0, 12)}...
                      </Link>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-2">{r.username ?? "-"}</td>
                  <td className="px-3 py-2">{(r.character ?? "-").replace("CHARACTER.", "")}</td>
                  <td className="px-3 py-2 tabular-nums">{r.ascension ?? "-"}</td>
                  <td className="px-3 py-2">{r.win ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-xs">{r.build_id ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.run_hash && (
                      <button
                        onClick={() => remove(r.run_hash!)}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-900/40 hover:bg-rose-900/60"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
