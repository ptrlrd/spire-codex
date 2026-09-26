import { describe, expect, it } from "vitest";
import { parseReplayLines, type PickLine } from "./replay";

describe("pick line card upgrade parsing and edge cases", () => {
  const header = {
    t: "header",
    s: 0,
    ms: 0,
    floor: 0,
    act: 1,
    replay_version: 5,
  };

  it("retains integer upgrade counts for multi-upgraded and unupgraded cards", () => {
    const pick = {
      t: "pick",
      s: 1,
      floor: 1,
      act: 1,
      cards: [
        { c: 1, id: "SEARING_BLOW", up: 3 },
        { c: 2, id: "STRIKE_IRONCLAD", up: 0 },
        { c: 3, id: "DEFEND_IRONCLAD" },
      ],
    };
    const { lines, malformed } = parseReplayLines(
      [header, pick].map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(malformed).toBe(0);
    const parsed = lines.find((l) => l.t === "pick") as PickLine | undefined;
    expect(parsed?.cards[0]).toEqual({ c: 1, id: "SEARING_BLOW", up: 3 });
    expect(parsed?.cards[1]).toEqual({ c: 2, id: "STRIKE_IRONCLAD", up: 0 });
    expect(parsed?.cards[2].up).toBeUndefined();
  });

  it("handles pick lines with zero selectable cards without dropping the line", () => {
    const emptyPick = { t: "pick", s: 2, floor: 1, act: 1, cards: [] };
    const { lines } = parseReplayLines(
      [header, emptyPick].map((l) => JSON.stringify(l)).join("\n"),
    );
    const parsed = lines.find((l) => l.t === "pick") as PickLine | undefined;
    expect(parsed?.cards).toEqual([]);
  });
});
