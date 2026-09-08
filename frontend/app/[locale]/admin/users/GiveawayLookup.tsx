"use client";

// Giveaway helper folded into the Users page: paste a list of SteamID64s (one
// per line, or comma/space separated), resolve each to its Steam profile
// (persona + avatar, works for anyone with a public profile) and flag which are
// site members with run counts, then optionally pick a random winner. Lives here
// rather than on its own route so all account tooling stays under /admin/users.

import { useMemo, useState } from "react";
import { adminFetch } from "../shared";

interface SteamProfile {
  steam_id: string;
  persona: string;
  avatar: string | null;
  profile_url: string;
  privacy: string | null;
}

interface MemberInfo {
  user_id: string;
  username: string | null;
  is_partner: boolean;
  run_count: number;
}

interface ResolveRow {
  steam_id: string;
  valid: boolean;
  steam: SteamProfile | null;
  member: MemberInfo | null;
}

interface ResolveResponse {
  results: ResolveRow[];
  counts: {
    total: number;
    valid: number;
    invalid: number;
    resolved: number;
    members: number;
  };
}

function parseIds(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const badge = "px-1.5 py-0.5 rounded text-[10px] font-bold border";

export default function GiveawayLookup() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ResolveRow[]>([]);
  const [counts, setCounts] = useState<ResolveResponse["counts"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [membersOnly, setMembersOnly] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const eligible = useMemo(
    () => rows.filter((r) => r.valid && r.steam && (!membersOnly || r.member)),
    [rows, membersOnly],
  );
  const winner = rows.find((r) => r.steam_id === winnerId) ?? null;

  async function resolve() {
    const ids = parseIds(text);
    if (!ids.length) {
      setNote("Paste at least one SteamID64.");
      return;
    }
    setBusy(true);
    setNote(null);
    setWinnerId(null);
    try {
      const data = await adminFetch<ResolveResponse>("/api/admin/steam/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steam_ids: ids }),
      });
      setRows(data.results ?? []);
      setCounts(data.counts ?? null);
      if (!(data.results ?? []).length) setNote("Nothing to resolve.");
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function pickWinner() {
    if (!eligible.length) {
      setNote(
        membersOnly
          ? "No resolved site members to pick from."
          : "No resolved entrants to pick from.",
      );
      return;
    }
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    setWinnerId(chosen.steam_id);
    setNote(null);
  }

  const inputClass =
    "px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50";
  const actionBtn =
    "px-2.5 py-1 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]";

  return (
    <div className="mb-6 rounded-lg border border-[var(--border-subtle)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text-primary)]"
      >
        <span className="text-[var(--text-muted)]">{open ? "▾" : "▸"}</span>
        Giveaway lookup
        <span className="font-normal text-xs text-[var(--text-muted)]">
          resolve SteamID64s and pick a winner
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <textarea
            className={`${inputClass} w-full h-28 font-mono resize-y`}
            placeholder={"Paste SteamID64s (one per line, or comma/space separated)\n76561198000000000\n76561198000000001"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              onClick={resolve}
              disabled={busy}
              className="px-4 py-1.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Resolving..." : "Resolve"}
            </button>
            <button
              onClick={pickWinner}
              disabled={busy || !eligible.length}
              className={`${actionBtn} disabled:opacity-40`}
            >
              🎲 Pick random winner
            </button>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] select-none">
              <input
                type="checkbox"
                checked={membersOnly}
                onChange={(e) => setMembersOnly(e.target.checked)}
              />
              Members only ({rows.filter((r) => r.member).length})
            </label>
            {counts && (
              <span className="ml-auto text-xs text-[var(--text-muted)] tabular-nums">
                {counts.total} entrant{counts.total === 1 ? "" : "s"} · {counts.resolved}{" "}
                resolved · {counts.members} member{counts.members === 1 ? "" : "s"}
                {counts.invalid ? ` · ${counts.invalid} invalid` : ""}
              </span>
            )}
          </div>

          {note && (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{note}</p>
          )}

          {winner && winner.steam && (
            <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10">
              <span className="text-lg">🏆</span>
              {winner.steam.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={winner.steam.avatar}
                  alt=""
                  className="w-8 h-8 rounded"
                />
              )}
              <span className="text-sm text-[var(--text-primary)]">
                Winner: <b>{winner.steam.persona}</b>
                {winner.member?.username ? ` (@${winner.member.username})` : ""}
              </span>
              <a
                href={winner.steam.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-[var(--accent-gold)] hover:underline"
              >
                Steam profile →
              </a>
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-card)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Steam profile</th>
                    <th className="px-3 py-2">SteamID64</th>
                    <th className="px-3 py-2">Site account</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isWinner = r.steam_id === winnerId;
                    return (
                      <tr
                        key={r.steam_id}
                        className={`border-t border-[var(--border-subtle)] ${
                          isWinner ? "bg-[var(--accent-gold)]/10" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          {r.steam ? (
                            <a
                              href={r.steam.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 hover:underline"
                            >
                              {r.steam.avatar && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={r.steam.avatar}
                                  alt=""
                                  className="w-7 h-7 rounded"
                                />
                              )}
                              <span className="text-[var(--text-primary)]">
                                {r.steam.persona}
                              </span>
                            </a>
                          ) : (
                            <span
                              className={`${badge} bg-rose-950/50 text-rose-300 border-rose-900/50`}
                            >
                              {r.valid ? "private / not found" : "invalid id"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
                          {r.steam_id}
                        </td>
                        <td className="px-3 py-2">
                          {r.member ? (
                            <span className="flex flex-wrap items-center gap-1">
                              <span
                                className={`${badge} bg-emerald-950/50 text-emerald-300 border-emerald-900/50`}
                              >
                                Member
                              </span>
                              <span className="text-[var(--text-secondary)]">
                                {r.member.username ?? "-"} · {r.member.run_count} run
                                {r.member.run_count === 1 ? "" : "s"}
                              </span>
                              {r.member.is_partner && (
                                <span
                                  className={`${badge} bg-amber-950/50 text-amber-300 border-amber-900/50`}
                                >
                                  Partner
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              not a member
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
