import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  formatPicks,
  hasPredicates,
  paramsFromState,
  parsePicks,
  pick,
  predicateCount,
  stateFromParams,
} from "./seed-finder-state";

describe("seed finder predicate grammar", () => {
  it("parses id, count, act, floor window and seat", () => {
    expect(parsePicks("bash:2@1<=5, cleave>=10#2, anger")).toEqual([
      { id: "BASH", count: 2, act: 1, floorMax: 5, floorMin: null, seat: null },
      {
        id: "CLEAVE",
        count: 1,
        act: null,
        floorMax: null,
        floorMin: 10,
        seat: 2,
      },
      {
        id: "ANGER",
        count: 1,
        act: null,
        floorMax: null,
        floorMin: null,
        seat: null,
      },
    ]);
  });

  it("caps counts, drops duplicates and junk, keeps shop kind prefixes", () => {
    expect(parsePicks("BASH:9,BASH,??,RELIC:ANCHOR")).toEqual([
      pick("BASH", { count: 4 }),
      pick("RELIC:ANCHOR"),
    ]);
    expect(parsePicks(null)).toEqual([]);
  });

  it("round-trips through the url", () => {
    const state = {
      ...EMPTY_STATE,
      characters: ["SILENT", "DEFECT"],
      buildId: "v0.107.1",
      players: 2,
      win: true,
      neow: [pick("LEAD_PAPERWEIGHT")],
      offered: [pick("BASH", { count: 2, act: 1, floorMax: 5 })],
      bosses: [pick("VANTOM_BOSS", { act: 1 })],
      shop: [pick("RELIC:MEAL_TICKET")],
      ancient: "DARV",
      ancientAct: 2,
    };
    const params = paramsFromState(state);
    expect(params.get("character")).toBe("SILENT,DEFECT");
    expect(params.get("offered")).toBe("BASH:2@1<=5");
    expect(params.get("bosses")).toBe("VANTOM_BOSS@1");
    expect(params.get("shop")).toBe("RELIC:MEAL_TICKET");
    expect(params.get("win")).toBe("true");
    expect(stateFromParams(params)).toEqual(state);
    expect(formatPicks(state.offered)).toBe("BASH:2@1<=5");
  });

  it("ignores bad scope values and knows when there is something to search", () => {
    const s = stateFromParams(
      new URLSearchParams(
        "character=WIZARD&players=9&ancient_act=7&ancient=DARV",
      ),
    );
    expect(s.characters).toEqual([]);
    expect(s.players).toBeNull();
    expect(s.ancientAct).toBeNull();
    expect(hasPredicates(s)).toBe(true);
    expect(predicateCount(s)).toBe(1);
    expect(hasPredicates(EMPTY_STATE)).toBe(false);
    expect(paramsFromState(EMPTY_STATE).toString()).toBe("");
  });
});
