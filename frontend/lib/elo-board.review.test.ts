import { describe, expect, it } from "vitest";
import { ladderTitle, sortPlayers, type EloPlayer } from "./elo-board";

function makePlayer(over: Partial<EloPlayer>): EloPlayer {
  return {
    rank: 1,
    username: "player1",
    elo: 1000,
    lifetime: 1000,
    runs: 10,
    wins: 5,
    win_rate: 50,
    main_character: "IRONCLAD",
    by_character: {},
    ...over,
  };
}

describe("ladderTitle edge cases", () => {
  it("handles empty or missing by_character without throwing", () => {
    const empty = makePlayer({ by_character: {} });
    expect(ladderTitle(empty, (id) => id)).toBe("");

    const missing = makePlayer({
      by_character: undefined as unknown as Record<string, never>,
    });
    expect(ladderTitle(missing, (id) => id)).toBe("");
  });
});

describe("sortPlayers edge cases", () => {
  it("sorts by lifetime and breaks ties with rank", () => {
    const rows = [
      makePlayer({ username: "a", rank: 4, lifetime: 1200 }),
      makePlayer({ username: "b", rank: 2, lifetime: 1200 }),
      makePlayer({ username: "c", rank: 1, lifetime: 1100 }),
    ];
    const sorted = sortPlayers(rows, "lifetime");
    expect(sorted.map((p) => p.username)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate original array and handles empty input", () => {
    const rows = [
      makePlayer({ username: "z", rank: 2, elo: 1000 }),
      makePlayer({ username: "a", rank: 1, elo: 1200 }),
    ];
    const copy = [...rows];
    const sorted = sortPlayers(rows, "elo");

    expect(rows).toEqual(copy);
    expect(sorted[0].username).toBe("a");
    expect(sortPlayers([], "elo")).toEqual([]);
  });
});
