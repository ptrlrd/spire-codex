import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  formatCounted,
  hasPredicates,
  paramsFromState,
  parseCounted,
  stateFromParams,
} from "./seed-finder-state";
import { filterPickerItems } from "@/app/components/EntityPicker";

describe("seed finder URL state", () => {
  it("round-trips every predicate through the query string", () => {
    const state = {
      character: "SILENT",
      deck: [
        { id: "BASH", count: 2 },
        { id: "ANGER", count: 1 },
      ],
      offered: [{ id: "WHIRLWIND", count: 3 }],
      relics: ["AKABEKO", "ANCHOR"],
      events: ["BIG_FISH"],
      ancient: "ASTROLABE",
      ancientAct: 2,
    };
    const qs = paramsFromState(state).toString();
    expect(qs).toBe(
      "character=SILENT&deck=BASH%3A2%2CANGER&offered=WHIRLWIND%3A3&relics=AKABEKO%2CANCHOR&events=BIG_FISH&ancient=ASTROLABE&ancient_act=2",
    );
    expect(stateFromParams(new URLSearchParams(qs))).toEqual(state);
  });

  it("drops junk, duplicates and out-of-range values", () => {
    const state = stateFromParams(
      new URLSearchParams(
        "character=merchant&deck=bash:9,bash,%20anger%20:0&relics=,,akabeko,akabeko&ancient_act=3",
      ),
    );
    expect(state.character).toBe("ANY");
    expect(state.deck).toEqual([
      { id: "BASH", count: 4 },
      { id: "ANGER", count: 1 },
    ]);
    expect(state.relics).toEqual(["AKABEKO"]);
    expect(state.ancient).toBeNull();
    expect(state.ancientAct).toBeNull();
  });

  it("formats counts only above one", () => {
    expect(formatCounted(parseCounted("BASH:2,ANGER:1,WHIRLWIND"))).toBe(
      "BASH:2,ANGER,WHIRLWIND",
    );
  });

  it("knows when there is nothing to search for", () => {
    expect(hasPredicates(EMPTY_STATE)).toBe(false);
    expect(paramsFromState(EMPTY_STATE).toString()).toBe("");
    expect(hasPredicates({ ...EMPTY_STATE, ancient: "ANCHOR" })).toBe(true);
  });
});

describe("entity picker filtering", () => {
  const items = [
    { id: "BASH", name: "Bash" },
    { id: "BATTLE_TRANCE", name: "Battle Trance" },
    { id: "SMASH", name: "Smash" },
    { id: "ANGER", name: "Anger" },
  ];

  it("returns nothing for an empty query", () => {
    expect(filterPickerItems(items, "  ")).toEqual([]);
  });

  it("ranks prefix matches before substring matches, case-insensitively", () => {
    expect(filterPickerItems(items, "ba").map((i) => i.id)).toEqual([
      "BASH",
      "BATTLE_TRANCE",
    ]);
    expect(filterPickerItems(items, "ASH").map((i) => i.id)).toEqual([
      "BASH",
      "SMASH",
    ]);
  });

  it("caps the list", () => {
    expect(filterPickerItems(items, "a", 2)).toHaveLength(2);
  });
});
