"use client";

// User admin: list/search every account, rename (admin override of the 3/day
// cap), delete (keeps runs, just unlinks them), and merge one account into
// another (moves runs + lifts missing identities, then deletes the source).

import { useCallback, useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";

interface UserRow {
  _id: string;
  username: string | null;
  email: string | null;
  steam_id: string | null;
  discord_id: string | null;
  twitch_id: string | null;
  twitch_login: string | null;
  is_partner: boolean;
  created_at: string | null;
  run_count: number;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 50;

function IdentityBadges({ u }: { u: UserRow }) {
  const badge = "px-1.5 py-0.5 rounded text-[10px] font-bold border";
  return (
    <span className="flex flex-wrap gap-1">
      {u.steam_id && (
        <span
          className={`${badge} bg-sky-950/50 text-sky-300 border-sky-900/50`}
          title={`Steam ${u.steam_id}`}
        >
          Steam
        </span>
      )}
      {u.discord_id && (
        <span
          className={`${badge} bg-indigo-950/50 text-indigo-300 border-indigo-900/50`}
          title={`Discord ${u.discord_id}`}
        >
          Discord
        </span>
      )}
      {u.twitch_id && (
        <span
          className={`${badge} bg-[#9146FF]/15 text-[#b794ff] border-[#9146FF]/40`}
          title={`Twitch ${u.twitch_login ?? u.twitch_id}`}
        >
          Twitch
        </span>
      )}
      {u.is_partner && (
        <span className={`${badge} bg-amber-950/50 text-amber-300 border-amber-900/50`}>
          Partner
        </span>
      )}
    </span>
  );
}

export default function UsersClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // When set, the table is in "pick a target" mode for merging this account.
  const [mergeSource, setMergeSource] = useState<UserRow | null>(null);

  const load = useCallback(async (search: string, pg: number) => {
    setBusy(true);
    setNote(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (search.trim()) params.set("q", search.trim());
      const data = await adminFetch<UsersResponse>(`/api/admin/users?${params}`);
      setRows(data.users ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? pg);
      if (!(data.users ?? []).length) setNote("No accounts matched.");
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load("", 1);
  }, [load]);

  function search() {
    setMergeSource(null);
    load(q, 1);
  }

  async function rename(u: UserRow) {
    const next = window.prompt(`New display name for "${u.username ?? u._id}":`, u.username ?? "");
    if (next == null) return;
    if (!next.trim() || next.trim() === (u.username ?? "")) return;
    try {
      const res = await adminFetch<{ username: string }>(`/api/admin/users/${u._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next.trim() }),
      });
      setRows((prev) =>
        prev.map((r) => (r._id === u._id ? { ...r, username: res.username } : r)),
      );
      setNote(`Renamed to "${res.username}".`);
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  async function remove(u: UserRow) {
    const msg =
      `Delete account "${u.username ?? u._id}"?\n\n` +
      `Its ${u.run_count} run(s) are kept but unlinked (set to anonymous). ` +
      `Use Merge instead to keep run attribution.`;
    if (!window.confirm(msg)) return;
    try {
      const res = await adminFetch<{ runs_unlinked: number }>(
        `/api/admin/users/${u._id}`,
        { method: "DELETE" },
      );
      setRows((prev) => prev.filter((r) => r._id !== u._id));
      setTotal((t) => Math.max(0, t - 1));
      setNote(`Deleted "${u.username ?? u._id}". ${res.runs_unlinked} run(s) unlinked.`);
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  async function togglePartner(u: UserRow) {
    const next = !u.is_partner;
    try {
      await adminFetch(`/api/admin/users/${u._id}/partner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_partner: next }),
      });
      setRows((prev) =>
        prev.map((r) => (r._id === u._id ? { ...r, is_partner: next } : r)),
      );
      setNote(
        next
          ? `"${u.username ?? u._id}" is now a partner.`
          : `Removed partner from "${u.username ?? u._id}".`,
      );
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  async function mergeInto(target: UserRow) {
    const src = mergeSource;
    if (!src) return;
    if (src._id === target._id) {
      setNote("Pick a different account as the target.");
      return;
    }
    const msg =
      `Merge "${src.username ?? src._id}" INTO "${target.username ?? target._id}"?\n\n` +
      `- ${src.run_count} run(s) move to "${target.username ?? target._id}"\n` +
      `- "${target.username ?? target._id}" gains any Steam/Discord/Twitch/email it is missing\n` +
      `- "${src.username ?? src._id}" is then deleted\n\nThis cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      const res = await adminFetch<{ runs_moved: number; copied: string[] }>(
        `/api/admin/users/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: src._id, target_id: target._id }),
        },
      );
      setMergeSource(null);
      setNote(
        `Merged. ${res.runs_moved} run(s) moved` +
          (res.copied.length ? `, lifted: ${res.copied.join(", ")}.` : "."),
      );
      load(q, page);
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  const inputClass =
    "px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50";
  const actionBtn =
    "px-2.5 py-1 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]";
  const lastPage = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <AdminShell title="Users" subtitle="search, rename, delete, merge">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className={`${inputClass} w-80`}
          placeholder="Search username, email, Steam / Discord / Twitch id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button
          onClick={search}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Loading..." : "Search"}
        </button>
        <span className="ml-auto self-center text-xs text-[var(--text-muted)]">
          {total} account{total === 1 ? "" : "s"}
        </span>
      </div>

      {mergeSource && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10">
          <span className="text-sm text-[var(--text-primary)]">
            Merging <b>{mergeSource.username ?? mergeSource._id}</b> into… pick a target
            row.
          </span>
          <button
            onClick={() => setMergeSource(null)}
            className={`${actionBtn} ml-auto`}
          >
            Cancel
          </button>
        </div>
      )}

      {note && <p className="text-sm text-[var(--text-secondary)] mb-4">{note}</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-card)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Identities</th>
                <th className="px-3 py-2">Runs</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSource = mergeSource?._id === u._id;
                return (
                  <tr
                    key={u._id}
                    className={`border-t border-[var(--border-subtle)] ${
                      isSource ? "bg-[var(--accent-gold)]/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="text-[var(--text-primary)]">{u.username ?? "-"}</div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)]">
                        {u._id}
                        {u.email ? ` · ${u.email}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <IdentityBadges u={u} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{u.run_count}</td>
                    <td className="px-3 py-2 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {mergeSource ? (
                          isSource ? (
                            <span className="text-xs text-[var(--accent-gold)] self-center">
                              source
                            </span>
                          ) : (
                            <button
                              onClick={() => mergeInto(u)}
                              className="px-2.5 py-1 rounded text-xs font-semibold bg-[var(--accent-gold)]/20 text-[var(--accent-gold)] border border-[var(--accent-gold)]/40 hover:bg-[var(--accent-gold)]/30"
                            >
                              Merge here
                            </button>
                          )
                        ) : (
                          <>
                            <button onClick={() => rename(u)} className={actionBtn}>
                              Rename
                            </button>
                            <button
                              onClick={() => {
                                setNote(null);
                                setMergeSource(u);
                              }}
                              className={actionBtn}
                            >
                              Merge
                            </button>
                            {u.twitch_id && (
                              <button
                                onClick={() => togglePartner(u)}
                                className={
                                  u.is_partner
                                    ? "px-2.5 py-1 rounded text-xs font-semibold bg-[#9146FF]/20 text-[#b794ff] border border-[#9146FF]/40 hover:bg-[#9146FF]/30"
                                    : actionBtn
                                }
                                title={
                                  u.is_partner
                                    ? "Remove curated-partner status"
                                    : "Mark as a curated partner (floats to the top of /live when live + streaming)"
                                }
                              >
                                {u.is_partner ? "Unpartner" : "Partner"}
                              </button>
                            )}
                            <button
                              onClick={() => remove(u)}
                              className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-900/40 hover:bg-rose-900/60"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => load(q, page - 1)}
            disabled={busy || page <= 1}
            className={`${actionBtn} disabled:opacity-40`}
          >
            ← Prev
          </button>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            Page {page} / {lastPage}
          </span>
          <button
            onClick={() => load(q, page + 1)}
            disabled={busy || page >= lastPage}
            className={`${actionBtn} disabled:opacity-40`}
          >
            Next →
          </button>
        </div>
      )}
    </AdminShell>
  );
}
