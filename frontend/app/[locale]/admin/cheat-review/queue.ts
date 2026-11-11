export interface Seat {
  run_hash: string;
  character: string | null;
  username: string | null;
  user_id: string | null;
  steam_id: string | null;
  player_key: string | null;
  runs: number | null;
  wins: number | null;
  has_replay: boolean;
}

export interface QueueRow {
  id: string;
  hashes: string[];
  seats: Seat[];
  seed: string | null;
  ascension: number | null;
  game_mode: string;
  player_count: number;
  run_time: number;
  floors: number;
  seconds_per_floor: number | null;
  build_id: string | null;
  played_at: string | null;
  submitted_at: string | null;
  deck_size: number | null;
  relic_count: number | null;
  board: { label: string; rank: number } | null;
  detector: string[];
  boss_turns: number[];
  score: number;
  flags: string[];
}

export interface QueueResponse {
  rows: QueueRow[];
  total: number;
  auto_hide_seconds: number;
  errors: string[];
  seconds: number;
}

export function fmtRunTime(sec: number): string {
  if (!(sec > 0)) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}m${s}s` : `${m}m${s}s`;
}

export function seatStats(seat: Seat): string {
  if (seat.runs === null || seat.wins === null) return "no stats yet";
  const rate = seat.runs > 0 ? Math.round((seat.wins / seat.runs) * 100) : 0;
  return `${seat.runs} ${seat.runs === 1 ? "run" : "runs"}, ${rate}% wins`;
}

export function afterRemoval(
  rows: QueueRow[],
  removed: Set<string>,
  focusId: string | null,
): string | null {
  const left = rows.filter((r) => !removed.has(r.id));
  if (!left.length) return null;
  if (focusId && !removed.has(focusId)) return focusId;
  const at = rows.findIndex((r) => r.id === focusId);
  const next = rows.slice(Math.max(at, 0)).find((r) => !removed.has(r.id));
  return (next ?? left[left.length - 1]).id;
}

export function step(
  rows: QueueRow[],
  focusId: string | null,
  delta: number,
): string | null {
  if (!rows.length) return null;
  const at = rows.findIndex((r) => r.id === focusId);
  if (at < 0) return rows[0].id;
  return rows[Math.min(rows.length - 1, Math.max(0, at + delta))].id;
}

export function rowsByPlayer(rows: QueueRow[], playerKey: string): Set<string> {
  return new Set(
    rows
      .filter((r) => r.seats.some((s) => s.player_key === playerKey))
      .map((r) => r.id),
  );
}
