import { describe, expect, it } from "vitest";
import { parseReplayLines } from "./replay";
import { isTeammateRow } from "./replay-coop";
import { buildScene } from "./replay-scene";

const journal = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n");

const header = { t: "header", s: 0, ms: 0, floor: 0, act: 1, replay_version: 10, player_count: 2 };

describe("a v10 co-op journal shows the uploader's own run", () => {
  it("drops the teammate rows v10 adds and keeps the uploader's", () => {
    expect(isTeammateRow({ t: "decision", mine: false, player_slot: 1 })).toBe(true);
    expect(isTeammateRow({ t: "draw_order", mine: false })).toBe(true);
    expect(isTeammateRow({ t: "peer_msg", msg: "RewardSelectedMessage" })).toBe(true);
    expect(isTeammateRow({ t: "peer_deck", player_slot: 1, mine: false })).toBe(true);
    expect(isTeammateRow({ t: "decision", mine: true, player_slot: 0 })).toBe(false);
    expect(isTeammateRow({ t: "decision" })).toBe(false);
    // rows that carried mine:false before v10 are left to their readers
    expect(isTeammateRow({ t: "energy", mine: false })).toBe(false);
  });

  it("a teammate's event page is not read as the uploader's decision", () => {
    const text = journal([
      header,
      { t: "decision", s: 1, ms: 1, floor: 1, act: 1, decision_id: 1, decision_type: "event",
        mine: true, player_slot: 0, options: [{ option_index: 0, option_id: "A" }] },
      { t: "decision", s: 2, ms: 2, floor: 1, act: 1, decision_id: 2, decision_type: "event",
        mine: false, player_slot: 1, options: [{ option_index: 0, option_id: "B" }] },
      { t: "peer_msg", s: 3, ms: 3, floor: 1, act: 1, msg: "OptionIndexChosenMessage",
        sender_slot: 1, mine: false, option_type: "event", option_index: 0 },
    ]);
    const { lines, malformed } = parseReplayLines(text);
    expect(malformed).toBe(0);
    expect(lines.map((l) => l.s)).toEqual([0, 1]);
  });

  it("the scene's draw pile is the uploader's even when the teammate's follows", () => {
    const text = journal([
      header,
      { t: "combat_start", s: 1, ms: 1, floor: 1, act: 1, encounter: "X", enemies: [] },
      { t: "draw_order", s: 2, ms: 2, floor: 1, act: 1, order_c: [1, 2], mine: true, player_slot: 0 },
      { t: "draw_order", s: 3, ms: 3, floor: 1, act: 1, order_c: [9, 8], mine: false, player_slot: 1 },
      { t: "draw", s: 4, ms: 4, floor: 1, act: 1, c: 1, id: "STRIKE", mine: true, player_slot: 0 },
    ]);
    const without = journal([
      header,
      { t: "combat_start", s: 1, ms: 1, floor: 1, act: 1, encounter: "X", enemies: [] },
      { t: "draw_order", s: 2, ms: 2, floor: 1, act: 1, order_c: [1, 2], mine: true, player_slot: 0 },
      { t: "draw", s: 4, ms: 4, floor: 1, act: 1, c: 1, id: "STRIKE", mine: true, player_slot: 0 },
    ]);
    expect(JSON.stringify(buildScene(text))).toEqual(JSON.stringify(buildScene(without)));
  });
});
