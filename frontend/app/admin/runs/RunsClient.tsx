"use client";

// Run admin: search by username / seed / hash, inspect, hide, or delete.
// "Hide" flags a run as ineligible (reversible) so it drops out of the
// leaderboards, /charts, and the run browser without deleting it. "Fast wins"
// surfaces the cheater review queue - implausibly fast wins, fastest first.

import { useState } from "react";
import Link from "next/link";
import { AdminShell, adminFetch } from "../shared";

interface RunRow {
  run_hash?: string;
  username?: string | null;
  character?: string | null;
  ascension?: number | null;
  win?: boolean | number | null;
  run_time?: number | null;
  hidden?: boolean | null;
  hidden_reason?: string | null;
  player_count?: number | null;
  build_id?: string | null;
  submitted_at?: string | null;
  seed?: string | null;
  deck_size?: number | null;
  reasons?: string[];
}

// Wins faster than this many seconds are flagged for review - no legit full run
// wins this fast. Powers the "Fast wins" review-queue button.
const FAST_WIN_SECONDS = 300;

function fmtTime(sec?: number | null): string {
  if (typeof sec !== "number" || sec <= 0) return "-";
  const m = Math.floor(sec / 60);
  return `${m}m${String(sec % 60).padStart(2, "0")}s`;
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

  async function findFastWins() {
    setBusy(true);
    setNote(null);
    try {
      const data = await adminFetch<{ runs: RunRow[] }>(
        `/api/admin/runs/search?max_win_seconds=${FAST_WIN_SECONDS}&limit=100`,
      );
      setRows(data.runs ?? []);
      setNote(
        (data.runs ?? []).length
          ? `Wins under ${FAST_WIN_SECONDS / 60} min, fastest first. Hide the fake ones.`
          : "No suspiciously fast wins found.",
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function findAnomalies() {
    setBusy(true);
    setNote(null);
    try {
      const data = await adminFetch<{ runs: RunRow[] }>(
        `/api/admin/runs/search?anomalies=true&limit=100`,
      );
      setRows(data.runs ?? []);
      setNote(
        (data.runs ?? []).length
          ? "Implausible runs: fast wins, marathon times, giant decks. Hide the fake ones."
          : "No anomalous runs found.",
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function setHidden(runHash: string, hidden: boolean) {
    try {
      await adminFetch(`/api/admin/runs/${runHash}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      setRows((prev) =>
        prev.map((r) => (r.run_hash === runHash ? { ...r, hidden } : r)),
      );
      setNote(
        hidden
          ? `Hid ${runHash.slice(0, 12)}... - it drops from rankings on the next rebuild.`
          : `Restored ${runHash.slice(0, 12)}...`,
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
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

  async function findHidden() {
    setBusy(true);
    setNote(null);
    try {
      const data = await adminFetch<{ runs: RunRow[] }>(
        `/api/admin/runs/search?hidden_only=true&limit=100`,
      );
      setRows(data.runs ?? []);
      setNote(
        (data.runs ?? []).length
          ? "Everything currently hidden, newest first. auto: reasons come from the cheat detector."
          : "Nothing is hidden right now.",
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function cheatSweep(dryRun: boolean) {
    if (!dryRun && !confirm("Hide every run the sweep flags? They leave all stats and leaderboards.")) return;
    setBusy(true);
    setNote(null);
    try {
      const data = await adminFetch<{ flagged: { run_hash: string; reason: string }[]; hidden: number; dry_run: boolean }>(
        `/api/admin/runs/cheat-sweep?dry_run=${dryRun}`,
        { method: "POST" },
      );
      setRows(
        data.flagged.map((f) => ({ run_hash: f.run_hash, hidden_reason: f.reason, hidden: !data.dry_run })),
      );
      setNote(
        data.dry_run
          ? `Sweep would hide ${data.flagged.length} runs (stacked relics, boss teleports). Run it for real to hide them.`
          : `Hid ${data.hidden} runs.`,
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50";

  return (
    <AdminShell title="Runs" subtitle="search, inspect, hide, delete">
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
        <button
          onClick={findFastWins}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          title="Show wins under 5 minutes, fastest first - the cheater review queue"
        >
          Fast wins &lt;5m
        </button>
        <button
          onClick={findAnomalies}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          title="Fast wins, marathon run times, and giant decks in one queue"
        >
          Anomalies
        </button>
        <button
          onClick={findHidden}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          title="Everything currently hidden, with the auto-hide reason"
        >
          Hidden only
        </button>
        <button
          onClick={() => cheatSweep(true)}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          title="Scan for stacked relic copies and boss-teleport wins; dry run first"
        >
          Cheat sweep (dry)
        </button>
        <button
          onClick={() => cheatSweep(false)}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg border border-red-500/40 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          title="Hide everything the sweep flags"
        >
          Sweep & hide
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
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Build</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.run_hash}
                  className={`border-t border-[var(--border-subtle)] ${r.hidden ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.run_hash ? (
                      <Link href={`/runs/${r.run_hash}`} className="text-[var(--accent-gold)] hover:underline">
                        {r.run_hash.slice(0, 12)}...
                      </Link>
                    ) : "-"}
                    {r.hidden_reason && (
                      <span className="block text-[10px] text-red-400/80 font-mono" title="auto-hide reason">
                        {r.hidden_reason}
                      </span>
                    )}
                    {r.hidden && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-rose-950/50 text-rose-300 border-rose-900/50">
                        hidden
                      </span>
                    )}
                    {(r.reasons ?? []).map((reason) => (
                      <span
                        key={reason}
                        className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-amber-950/50 text-amber-300 border-amber-900/50"
                      >
                        {reason}
                        {reason.startsWith("deck") && r.deck_size ? ` (${r.deck_size})` : ""}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2">{r.username ?? "-"}</td>
                  <td className="px-3 py-2">{(r.character ?? "-").replace("CHARACTER.", "")}</td>
                  <td className="px-3 py-2 tabular-nums">{r.ascension ?? "-"}</td>
                  <td className="px-3 py-2">{r.win ? "yes" : "no"}</td>
                  <td className="px-3 py-2 tabular-nums text-xs">{fmtTime(r.run_time)}</td>
                  <td className="px-3 py-2 text-xs">{r.build_id ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {r.run_hash && (
                        <button
                          onClick={() => setHidden(r.run_hash!, !r.hidden)}
                          className="px-2.5 py-1 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                        >
                          {r.hidden ? "Unhide" : "Hide"}
                        </button>
                      )}
                      {r.run_hash && (
                        <button
                          onClick={() => remove(r.run_hash!)}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-900/40 hover:bg-rose-900/60"
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
