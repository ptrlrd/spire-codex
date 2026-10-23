import { describe, expect, it } from "vitest";
import { ladderTitle, sortPlayers, type EloPlayer } from "./elo-board";
import { X9H } from "./i18n-x9h";
import { SUPPORTED_LANGS } from "./languages";

function player(over: Partial<EloPlayer>): EloPlayer {
  return {
    rank: 1,
    username: "a",
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

describe("top 100 board", () => {
  it("sorts by the chosen key and keeps rank as the tiebreaker", () => {
    const rows = [
      player({ rank: 1, username: "x", elo: 1300, lifetime: 1100 }),
      player({ rank: 2, username: "y", elo: 1250, lifetime: 1200 }),
      player({ rank: 3, username: "z", elo: 1250, lifetime: 1150 }),
    ];
    expect(sortPlayers(rows, "elo").map((p) => p.username)).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(sortPlayers(rows, "lifetime").map((p) => p.username)).toEqual([
      "y",
      "z",
      "x",
    ]);
  });

  it("lists ladders busiest first in the hover title", () => {
    const p = player({
      by_character: {
        silent: { elo: 1210.4, runs: 12, wins: 7 },
        ironclad: { elo: 1333.6, runs: 40, wins: 28 },
      },
    });
    expect(ladderTitle(p, (id) => id.toUpperCase())).toBe(
      "IRONCLAD 1334 (28/40) · SILENT 1210 (7/12)",
    );
  });

  it("translates every board string into every language", () => {
    const codes = ["eng", ...SUPPORTED_LANGS];
    for (const [key, table] of Object.entries(X9H)) {
      for (const code of codes) {
        expect(table[code], `${key} / ${code}`).toBeTruthy();
      }
    }
  });
});
