"use client";

// Hidden player Elo board: A10 standard runs rated against per-character
// community difficulty anchors. Elo answers "best right now" (sequential,
// recency-weighted); Lifetime answers "best proven record" (Wilson lower
// bound vs the same anchors, order-independent). Clicking a row charts the
// player's full Elo trajectory. Display experiment — nothing public serves
// any of this.

import { Fragment, useEffect, useState } from "react";
import EloTrajectory, { type EloPoint } from "@/app/components/EloTrajectory";
import { AdminShell, adminFetch } from "../shared";

interface EloRow {
  user_id: string;
  username: string | null;
  elo: number;
  lifetime?: number;
  runs: number;
  wins: number;
}

interface Board {
  players?: EloRow[];
  computed_at?: number;
  compute_seconds?: number;
  building?: boolean;
}

interface History {
  username: string | null;
  history: EloPoint[];
}

function TrajectoryChart({ userId }: { userId: string }) {
  const [hist, setHist] = useState<History | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<History>(`/api/admin/player-elo/${userId}/history`)
      .then(setHist)
      .catch((e) => setErr(String((e as Error)?.message || e)));
  }, [userId]);

  if (err) return <p className="text-xs text-rose-400 py-3">{err}</p>;
  if (!hist) return <p className="text-xs text-[var(--text-muted)] py-3">Loading trajectory…</p>;

  return (
    <div className="py-2">
      <EloTrajectory points={hist.history} />
    </div>
  );
}

export default function EloClient() {
  const [board, setBoard] = useState<Board | null>(null);
  const [minRuns, setMinRuns] = useState(10);
  const [sortKey, setSortKey] = useState<"elo" | "lifetime">("elo");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // First-ever load (and every Recompute) kicks a background walk
  // server-side; poll until it lands instead of holding a request open
  // past the gateway timeout.
  const load = (refresh = false) => {
    setBusy(true);
    adminFetch<Board>(`/api/admin/player-elo${refresh ? "?refresh=1" : ""}`)
      .then((d) => {
        if (d.building) {
          setNote("Computing the board in the background…");
          setTimeout(() => load(false), 5000);
          return;
        }
        setNote(null);
        setBoard(d);
        setBusy(false);
      })
      .catch((e) => {
        setNote(String((e as Error)?.message || e));
        setBusy(false);
      });
  };
  useEffect(() => load(), []);

  const rows = (board?.players || [])
    .filter((p) => p.runs >= minRuns)
    .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));

  const sortHeader = (key: "elo" | "lifetime", label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={sortKey === key ? "text-[var(--accent-gold)]" : "hover:text-[var(--text-primary)]"}
    >
      {label}
      {sortKey === key ? " ↓" : ""}
    </button>
  );

  return (
    <AdminShell
      title="Player Elo"
      subtitle="A10 standard runs, rated against per-character community difficulty. Elo = current form; Lifetime = Wilson-bounded whole record. Hidden — admin eyes only."
    >
      <div className="flex items-center gap-3 mb-4 text-sm">
        <label className="text-[var(--text-muted)]">
          Min rated runs{" "}
          <input
            type="number"
            min={1}
            value={minRuns}
            onChange={(e) => setMinRuns(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 ml-1 px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
          />
        </label>
        <button
          onClick={() => load(true)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] disabled:opacity-50"
        >
          {busy ? "Computing…" : "Recompute"}
        </button>
        {board?.players && (
          <span className="text-xs text-[var(--text-muted)]">
            {board.players.length.toLocaleString()} rated players · computed in{" "}
            {board.compute_seconds ?? "?"}s ·{" "}
            {board.computed_at
              ? new Date(board.computed_at * 1000).toLocaleTimeString()
              : ""}
          </span>
        )}
        {note && <span className="text-xs text-rose-400">{note}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm tabular-nums w-full max-w-3xl">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <th className="py-1.5 pr-4">#</th>
              <th className="py-1.5 pr-4">Player</th>
              <th className="py-1.5 pr-4 text-right">{sortHeader("elo", "Elo")}</th>
              <th className="py-1.5 pr-4 text-right">{sortHeader("lifetime", "Lifetime")}</th>
              <th className="py-1.5 pr-4 text-right">A10 runs</th>
              <th className="py-1.5 pr-4 text-right">Wins</th>
              <th className="py-1.5 text-right">WR</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((p, i) => (
              <Fragment key={p.user_id}>
                <tr
                  onClick={() => setExpanded(expanded === p.user_id ? null : p.user_id)}
                  className="border-t border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-card)]"
                >
                  <td className="py-1.5 pr-4 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="py-1.5 pr-4 text-[var(--text-primary)]">
                    {p.username || <span className="text-[var(--text-muted)]">{p.user_id.slice(0, 8)}…</span>}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-semibold text-[var(--accent-gold)]">
                    {Math.round(p.elo)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-[var(--text-secondary)]">
                    {p.lifetime != null ? Math.round(p.lifetime) : "–"}
                  </td>
                  <td className="py-1.5 pr-4 text-right">{p.runs.toLocaleString()}</td>
                  <td className="py-1.5 pr-4 text-right">{p.wins.toLocaleString()}</td>
                  <td className="py-1.5 text-right">
                    {p.runs ? ((p.wins / p.runs) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
                {expanded === p.user_id && (
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td colSpan={7}>
                      <TrajectoryChart userId={p.user_id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
