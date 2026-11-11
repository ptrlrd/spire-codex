import { describe, expect, it } from "vitest";
import {
  afterRemoval,
  fmtRunTime,
  rowsByPlayer,
  seatStats,
  step,
  type QueueRow,
  type Seat,
} from "./queue";

function seat(over: Partial<Seat> = {}): Seat {
  return {
    run_hash: "h",
    character: "SILENT",
    username: "p",
    user_id: null,
    steam_id: null,
    player_key: "n:p",
    runs: 10,
    wins: 3,
    has_replay: false,
    ...over,
  };
}

function row(id: string, playerKey = `n:${id}`): QueueRow {
  return {
    id,
    hashes: [id],
    seats: [seat({ run_hash: id, player_key: playerKey })],
    seed: null,
    ascension: 0,
    game_mode: "standard",
    player_count: 1,
    run_time: 600,
    floors: 49,
    seconds_per_floor: 12.2,
    build_id: null,
    played_at: null,
    submitted_at: null,
    deck_size: null,
    relic_count: null,
    board: null,
    detector: [],
    boss_turns: [],
    score: 0,
    flags: [],
  };
}

const rows = [row("a"), row("b", "n:x"), row("c"), row("d", "n:x")];

describe("cheat review queue helpers", () => {
  it("formats run times", () => {
    expect(fmtRunTime(0)).toBe("-");
    expect(fmtRunTime(305)).toBe("5m05s");
    expect(fmtRunTime(3725)).toBe("1h02m05s");
  });

  it("describes a seat's record", () => {
    expect(seatStats(seat())).toBe("10 runs, 30% wins");
    expect(seatStats(seat({ runs: 1, wins: 1 }))).toBe("1 run, 100% wins");
    expect(seatStats(seat({ runs: null, wins: null }))).toBe("no stats yet");
  });

  it("moves the focus within bounds", () => {
    expect(step(rows, "a", 1)).toBe("b");
    expect(step(rows, "a", -1)).toBe("a");
    expect(step(rows, "d", 1)).toBe("d");
    expect(step(rows, null, 1)).toBe("a");
    expect(step([], "a", 1)).toBeNull();
  });

  it("keeps the focus in place when rows leave", () => {
    expect(afterRemoval(rows, new Set(["b"]), "b")).toBe("c");
    expect(afterRemoval(rows, new Set(["d"]), "d")).toBe("c");
    expect(afterRemoval(rows, new Set(["b", "c"]), "b")).toBe("d");
    expect(afterRemoval(rows, new Set(["a"]), "c")).toBe("c");
    expect(afterRemoval(rows, new Set(["a", "b", "c", "d"]), "a")).toBeNull();
  });

  it("finds every row a player sits in", () => {
    expect([...rowsByPlayer(rows, "n:x")]).toEqual(["b", "d"]);
  });
});
