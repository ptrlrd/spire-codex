import { describe, expect, it } from "vitest";
import { markBetaUnlocks } from "./unlocks-merge";

describe("markBetaUnlocks", () => {
  const merged = {
    characters: [{ id: "REGENT" }, { id: "FOOL" }, { id: "SILENT" }],
    cards: [{ id: "A" }, { id: "B" }],
  };

  it("flags rows the main list lacks and orders the characters", () => {
    const out = markBetaUnlocks(merged, {
      characters: [{ id: "REGENT" }, { id: "SILENT" }],
      cards: [{ id: "A" }],
    });
    expect(out.characters).toEqual([
      { id: "SILENT" },
      { id: "REGENT" },
      { id: "FOOL", beta: true },
    ]);
    expect(out.cards).toEqual([{ id: "A" }, { id: "B", beta: true }]);
  });

  it("flags nothing when the main list is unavailable", () => {
    const out = markBetaUnlocks(merged, null);
    expect(out.cards).toEqual(merged.cards);
    expect(out.characters.some((c) => "beta" in c)).toBe(false);
  });
});
