import { describe, expect, it } from "vitest";
import { parseReplayLines } from "./replay";
import { isTeammateRow } from "./replay-coop";
import { buildScene } from "./replay-scene";

const journal = (rows: object[]) =>
  rows.map((r) => JSON.stringify(r)).join("\n");

const header = {
  t: "header",
  s: 0,
  ms: 0,
  floor: 0,
  act: 1,
  replay_version: 10,
  player_count: 2,
};

const at = { floor: 1, act: 1 };

describe("a v10 co-op journal shows the uploader's own run", () => {
  it("drops the teammate rows v10 adds and keeps the uploader's", () => {
    const teammate = [
      { t: "decision", mine: false, player_slot: 1 },
      { t: "draw_order", mine: false },
      { t: "peer_msg", msg: "RewardSelectedMessage" },
      { t: "peer_deck", player_slot: 1, mine: false },
      { t: "peer_shop", player_slot: 1, mine: false },
    ];
    // rows that carried mine:false before v10 are left to their readers
    const kept = [
      { t: "decision", mine: true, player_slot: 0 },
      { t: "decision" },
      { t: "energy", mine: false },
    ];
    for (const raw of teammate) expect(isTeammateRow(raw)).toBe(true);
    for (const raw of kept) expect(isTeammateRow(raw)).toBe(false);
  });

  it("keeps a teammate's event page out of the timeline", () => {
    const text = journal([
      header,
      {
        t: "decision",
        s: 1,
        ms: 1,
        ...at,
        decision_id: 1,
        decision_type: "event",
        mine: true,
        player_slot: 0,
        options: [{ option_index: 0, option_id: "A" }],
      },
      {
        t: "decision",
        s: 2,
        ms: 2,
        ...at,
        decision_id: 2,
        decision_type: "event",
        mine: false,
        player_slot: 1,
        options: [{ option_index: 0, option_id: "B" }],
      },
      {
        t: "peer_msg",
        s: 3,
        ms: 3,
        ...at,
        msg: "OptionIndexChosenMessage",
        sender_slot: 1,
        mine: false,
        option_type: "event",
        option_index: 0,
      },
    ]);
    const { lines, malformed } = parseReplayLines(text);
    expect(malformed).toBe(0);
    expect(lines.map((l) => l.s)).toEqual([0, 1]);
  });

  it("keeps the uploader's draw pile in the scene", () => {
    const start = {
      t: "combat_start",
      s: 1,
      ms: 1,
      ...at,
      encounter: "X",
      enemies: [],
    };
    const mine = {
      t: "draw_order",
      s: 2,
      ms: 2,
      ...at,
      order_c: [1, 2],
      mine: true,
      player_slot: 0,
    };
    const theirs = {
      t: "draw_order",
      s: 3,
      ms: 3,
      ...at,
      order_c: [9, 8],
      mine: false,
      player_slot: 1,
    };
    const draw = {
      t: "draw",
      s: 4,
      ms: 4,
      ...at,
      c: 1,
      id: "STRIKE",
      mine: true,
      player_slot: 0,
    };
    const both = journal([header, start, mine, theirs, draw]);
    const only = journal([header, start, mine, draw]);
    const withTeammate = JSON.stringify(buildScene(both));
    const withoutTeammate = JSON.stringify(buildScene(only));
    expect(withTeammate).toEqual(withoutTeammate);
  });
});
