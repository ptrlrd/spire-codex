import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplay, parseReplayLines, type PickLine } from "./replay";

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

function journal(records: Record<string, unknown>[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

describe("an act line only borrows the act of the map that opened it once", () => {
  it("does not reuse a consumed map act for a later unpaired act line", () => {
    const text = readFileSync(
      new URL(
        "../../backend/tests/fixtures/v2-full-run.jsonl",
        import.meta.url,
      ),
      "utf-8",
    );

    const model = parseReplay(
      [
        text.trimEnd(),
        JSON.stringify({
          t: "act",
          s: Number.MAX_SAFE_INTEGER,
          floor: 0,
          act: 2,
          name: "HIVE",
        }),
      ].join("\n"),
    );

    expect(model.actNames[2]).toBe("HIVE");
    expect(model.actNames[3]).toBe("GLORY");
  });

  it("does not overwrite the previous act when a later act has an act line but no map line", () => {
    const model = parseReplay(
      journal([
        {
          t: "header",
          s: 0,
          ms: 0,
          floor: 0,
          act: 1,
          replay_version: 2,
          starting_deck: [],
        },
        { t: "map", s: 1, floor: 0, act: 1, nodes: [] },
        { t: "act", s: 2, floor: 0, act: 1, name: "OVERGROWTH" },
        { t: "map", s: 3, floor: 16, act: 2, nodes: [] },
        { t: "act", s: 4, floor: 16, act: 1, name: "HIVE" },
        { t: "map", s: 5, floor: 33, act: 3, nodes: [] },
        { t: "act", s: 6, floor: 33, act: 2, name: "GLORY" },
        { t: "act", s: 7, floor: 49, act: 4, name: "THE_ENDING" },
      ]),
    );
    expect(model.actNames).toEqual({
      1: "OVERGROWTH",
      2: "HIVE",
      3: "GLORY",
      4: "THE_ENDING",
    });
  });
});
