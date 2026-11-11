"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Link } from "@/i18n/navigation";
import { AdminShell, adminFetch } from "../shared";
import { fmtDateTimePacific } from "@/lib/pacific";
import { imageUrl } from "@/lib/image-url";
import {
  afterRemoval,
  fmtRunTime,
  rowsByPlayer,
  seatStats,
  step,
  type QueueResponse,
  type QueueRow,
  type Seat,
} from "./queue";

const BASE = "/api/admin/cheat-review";
const BATCH = 200;
const REFILL_BELOW = 8;
const MOVE_KEYS = new Set(["j", "k", "arrowdown", "arrowup"]);

type Undo =
  | { kind: "hide" | "clear"; hashes: string[]; rows: QueueRow[] }
  | { kind: "player"; runHash: string; reason: string; rows: QueueRow[] };

interface Meta {
  total: number;
  errors: string[];
  autoHide: number;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postHashes(
  path: string,
  hashes: string[],
  extra: Record<string, unknown>,
): Promise<void> {
  for (let i = 0; i < hashes.length; i += BATCH) {
    await post(path, { run_hashes: hashes.slice(i, i + BATCH), ...extra });
  }
}

function hashesOf(rows: QueueRow[]): string[] {
  return rows.flatMap((r) => r.hashes);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function errorText(e: unknown): string {
  return String((e as Error)?.message || e);
}

function bySuspicion(a: QueueRow, b: QueueRow): number {
  return b.score - a.score || a.run_time - b.run_time;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] font-mono text-[11px] text-[var(--text-primary)]">
      {children}
    </kbd>
  );
}

function SeatLine({
  seat,
  showCharacter,
  onHidePlayer,
}: {
  seat: Seat;
  showCharacter: boolean;
  onHidePlayer: (seat: Seat) => void;
}) {
  const character = (seat.character ?? "").replace("CHARACTER.", "");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {showCharacter && character && (
        <img
          src={imageUrl(
            `/static/images/characters/character_icon_${character.toLowerCase()}.webp`,
          )}
          alt={character}
          title={character}
          className="w-4 h-4 object-contain"
          loading="lazy"
        />
      )}
      {seat.username ? (
        <Link
          href={`/players/${encodeURIComponent(seat.username)}`}
          target="_blank"
          className="font-semibold text-[var(--text-primary)] hover:underline"
        >
          {seat.username}
        </Link>
      ) : (
        <span className="text-[var(--text-muted)]">
          {seat.steam_id ? `Steam ${seat.steam_id}` : "anonymous"}
        </span>
      )}
      {seat.player_key && (
        <span className="text-xs text-[var(--text-secondary)] tabular-nums">
          {seatStats(seat)}
        </span>
      )}
      {seat.has_replay && (
        <Link
          href={`/runs/${seat.run_hash}/replay`}
          target="_blank"
          className="text-xs text-[var(--accent-gold)] hover:underline"
        >
          replay
        </Link>
      )}
      {seat.player_key && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHidePlayer(seat);
          }}
          className="text-xs text-danger hover:underline"
        >
          hide all their runs
        </button>
      )}
    </div>
  );
}

function QueueItem({
  row,
  focused,
  checked,
  onFocus,
  onToggle,
  onHide,
  onClear,
  onHidePlayer,
}: {
  row: QueueRow;
  focused: boolean;
  checked: boolean;
  onFocus: (id: string) => void;
  onToggle: (id: string) => void;
  onHide: (row: QueueRow) => void;
  onClear: (row: QueueRow) => void;
  onHidePlayer: (row: QueueRow, seat: Seat) => void;
}) {
  const when = row.played_at ?? row.submitted_at;
  const characters = row.seats
    .map((s) => (s.character ?? "").replace("CHARACTER.", ""))
    .filter(Boolean);
  return (
    <li
      id={`review-${row.id}`}
      onClick={() => onFocus(row.id)}
      className={`rounded-lg border bg-[var(--bg-card)] p-3 sm:p-4 scroll-mt-52 ${
        focused
          ? "border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]/40"
          : "border-[var(--border-subtle)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(row.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select run ${row.id}`}
          className="mt-1.5 w-4 h-4 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span
              className="px-2 py-0.5 rounded text-xs font-bold tabular-nums border border-warning/40 bg-warning/10 text-warning"
              title="Suspicion score"
            >
              {row.score}
            </span>
            <span className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
              {fmtRunTime(row.run_time)}
            </span>
            <span className="text-sm text-[var(--text-secondary)] tabular-nums">
              {row.floors} floors
              {row.seconds_per_floor !== null
                ? `, ${row.seconds_per_floor}s each`
                : ""}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              {characters.map((c, i) => (
                <img
                  key={`${c}-${i}`}
                  src={imageUrl(
                    `/static/images/characters/character_icon_${c.toLowerCase()}.webp`,
                  )}
                  alt={c}
                  title={c}
                  className="w-5 h-5 object-contain"
                  loading="lazy"
                />
              ))}
              <span className="tabular-nums">A{row.ascension ?? 0}</span>
              <span>
                {row.player_count > 1 ? `co-op ${row.player_count}p` : "solo"}
              </span>
              {row.game_mode !== "standard" && <span>{row.game_mode}</span>}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {when ? fmtDateTimePacific(when) : "-"}
              {row.build_id ? ` · ${row.build_id}` : ""}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {row.flags.map((flag) => (
              <span
                key={flag}
                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
                  row.detector.includes(flag)
                    ? "bg-danger/10 text-danger border-danger/30"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`}
              >
                {flag}
              </span>
            ))}
            {row.boss_turns.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[11px] border border-[var(--border-subtle)] text-[var(--text-muted)] tabular-nums">
                boss turns {row.boss_turns.join(" / ")}
              </span>
            )}
          </div>

          <div className="mt-2 space-y-1">
            {row.seats.map((seat) => (
              <SeatLine
                key={seat.run_hash}
                seat={seat}
                showCharacter={row.seats.length > 1}
                onHidePlayer={(s) => onHidePlayer(row, s)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onHide(row);
              }}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
            >
              Hide
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear(row);
              }}
              className="px-3 py-1.5 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
            >
              Looks fine
            </button>
            <Link
              href={`/runs/${row.id}`}
              target="_blank"
              className="px-3 py-1.5 rounded text-xs font-semibold text-[var(--accent-gold)] hover:underline"
            >
              Open run
            </Link>
            <span className="font-mono text-[11px] text-[var(--text-muted)] truncate">
              {row.id}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function CheatReviewClient() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("cheated");
  const [undo, setUndo] = useState<Undo | null>(null);

  useEffect(() => {
    let live = true;
    adminFetch<QueueResponse>(`${BASE}/queue?limit=60`)
      .then((d) => {
        if (!live) return;
        const next = d.rows ?? [];
        setRows(next);
        setMeta({
          total: d.total ?? next.length,
          errors: d.errors ?? [],
          autoHide: d.auto_hide_seconds ?? 300,
        });
        setFocusId((prev) =>
          prev && next.some((r) => r.id === prev)
            ? prev
            : (next[0]?.id ?? null),
        );
        setSelected(new Set());
      })
      .catch((e) => {
        if (live) setNote(errorText(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!focusId) return;
    document
      .getElementById(`review-${focusId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusId]);

  function reload() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  function targets(): QueueRow[] {
    if (selected.size) return rows.filter((r) => selected.has(r.id));
    return rows.filter((r) => r.id === focusId);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function take(
    gone: QueueRow[],
    send: () => Promise<string>,
    undoWith: Undo,
  ) {
    if (!gone.length) return;
    const ids = new Set(gone.map((r) => r.id));
    const left = rows.filter((r) => !ids.has(r.id));
    setRows(left);
    setFocusId(afterRemoval(rows, ids, focusId));
    setSelected(new Set());
    try {
      setNote(await send());
      setUndo(undoWith);
      setMeta((m) => (m ? { ...m, total: m.total - gone.length } : m));
      if (left.length < REFILL_BELOW && (meta?.total ?? 0) > rows.length)
        reload();
    } catch (e) {
      setNote(`${errorText(e)}. Nothing changed, reloading the queue.`);
      reload();
    }
  }

  function hide(gone: QueueRow[]) {
    const hashes = hashesOf(gone);
    const why = reason.trim() || "cheated";
    return take(
      gone,
      async () => {
        await postHashes("/hide", hashes, { hidden: true, reason: why });
        return `Hid ${plural(gone.length, "run")} (${why}).`;
      },
      { kind: "hide", hashes, rows: gone },
    );
  }

  function clear(gone: QueueRow[]) {
    const hashes = hashesOf(gone);
    return take(
      gone,
      async () => {
        await postHashes("/clear", hashes, { cleared: true });
        return `Marked ${plural(gone.length, "run")} as fine. They will not come back.`;
      },
      { kind: "clear", hashes, rows: gone },
    );
  }

  function hidePlayer(row: QueueRow, seat: Seat) {
    if (!seat.player_key) return;
    const who = seat.username ?? `Steam ${seat.steam_id}`;
    const count = seat.runs !== null ? ` (${plural(seat.runs, "run")})` : "";
    if (!window.confirm(`Hide every run by ${who}${count}?`)) return;
    const why = reason.trim() || "cheated";
    const ids = rowsByPlayer(rows, seat.player_key);
    const gone = rows.filter((r) => ids.has(r.id));
    return take(
      gone,
      async () => {
        const res = await post<{ changed: number; truncated: boolean }>(
          "/hide-player",
          { run_hash: seat.run_hash, hidden: true, reason: why },
        );
        return `Hid ${plural(res.changed, "run")} by ${who}${res.truncated ? ", and there are more: run it again" : ""}.`;
      },
      { kind: "player", runHash: seat.run_hash, reason: why, rows: gone },
    );
  }

  async function undoLast() {
    if (!undo) return;
    const last = undo;
    setUndo(null);
    try {
      if (last.kind === "player")
        await post("/hide-player", {
          run_hash: last.runHash,
          hidden: false,
          reason: last.reason,
        });
      else if (last.kind === "hide")
        await postHashes("/hide", last.hashes, { hidden: false });
      else await postHashes("/clear", last.hashes, { cleared: false });
      setRows((cur) => {
        const have = new Set(cur.map((r) => r.id));
        return [...last.rows.filter((r) => !have.has(r.id)), ...cur].sort(
          bySuspicion,
        );
      });
      setMeta((m) => (m ? { ...m, total: m.total + last.rows.length } : m));
      setFocusId(last.rows[0]?.id ?? focusId);
      setNote(`Undone. ${plural(last.rows.length, "run")} back in the queue.`);
    } catch (e) {
      setNote(errorText(e));
    }
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const focused = rows.find((r) => r.id === focusId);
    const key = e.key.toLowerCase();
    if (e.repeat && !MOVE_KEYS.has(key)) return;
    if (key === "j" || key === "arrowdown") setFocusId(step(rows, focusId, 1));
    else if (key === "k" || key === "arrowup")
      setFocusId(step(rows, focusId, -1));
    else if (key === "x" && focusId) toggle(focusId);
    else if (key === "a")
      setSelected(
        selected.size === rows.length
          ? new Set()
          : new Set(rows.map((r) => r.id)),
      );
    else if (key === "escape") setSelected(new Set());
    else if (key === "h") void hide(targets());
    else if (key === "n") void clear(targets());
    else if (key === "u") void undoLast();
    else if (key === "p" && focused) {
      const seat = focused.seats.find((s) => s.player_key);
      if (seat) void hidePlayer(focused, seat);
    } else if ((key === "o" || key === "enter") && focused)
      window.open(`/runs/${focused.id}`, "_blank", "noopener");
    else if (key === "r" && focused) {
      const seat = focused.seats.find((s) => s.has_replay);
      if (seat)
        window.open(`/runs/${seat.run_hash}/replay`, "_blank", "noopener");
    } else return;
    e.preventDefault();
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const picked = selected.size;
  const minutes = Math.round((meta?.autoHide ?? 300) / 60);

  return (
    <AdminShell
      title="Cheat review"
      subtitle="suspicious wins, most suspicious first"
    >
      <div className="sticky top-16 z-10 -mx-4 px-4 py-3 mb-4 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)] tabular-nums mr-auto">
            {loading
              ? "Loading the queue..."
              : `${plural(meta?.total ?? rows.length, "run")} to review`}
          </span>
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={120}
              className="w-40 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50"
            />
          </label>
          <button
            onClick={() => hide(targets())}
            disabled={!rows.length}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 disabled:opacity-50"
          >
            {picked ? `Hide ${picked} selected` : "Hide"}
          </button>
          <button
            onClick={() => clear(targets())}
            disabled={!rows.length}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          >
            {picked ? `${picked} look fine` : "Looks fine"}
          </button>
          <button
            onClick={reload}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
          <span>
            <Key>j</Key> <Key>k</Key> move
          </span>
          <span>
            <Key>h</Key> hide
          </span>
          <span>
            <Key>n</Key> looks fine
          </span>
          <span>
            <Key>x</Key> select
          </span>
          <span>
            <Key>a</Key> select all
          </span>
          <span>
            <Key>p</Key> hide all by player
          </span>
          <span>
            <Key>o</Key> open run
          </span>
          <span>
            <Key>r</Key> replay
          </span>
          <span>
            <Key>u</Key> undo
          </span>
        </div>
        {(note || undo) && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {note}{" "}
            {undo && (
              <button
                onClick={undoLast}
                className="font-semibold text-[var(--accent-gold)] hover:underline"
              >
                Undo
              </button>
            )}
          </p>
        )}
      </div>

      {(meta?.errors ?? []).length > 0 && (
        <p className="mb-4 text-sm text-warning">
          Some lookups did not finish, so this list may be short:{" "}
          {meta?.errors.join("; ")}
        </p>
      )}

      {!loading && !rows.length && (
        <p className="text-sm text-[var(--text-secondary)]">
          Nothing left to review. Wins under {minutes} minutes are hidden
          automatically.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => (
          <QueueItem
            key={row.id}
            row={row}
            focused={row.id === focusId}
            checked={selected.has(row.id)}
            onFocus={setFocusId}
            onToggle={toggle}
            onHide={(r) => hide([r])}
            onClear={(r) => clear([r])}
            onHidePlayer={hidePlayer}
          />
        ))}
      </ul>
    </AdminShell>
  );
}
