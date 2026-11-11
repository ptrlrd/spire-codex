import { describe, expect, it } from "vitest";
import {
  CHARACTER_ORDER,
  characterRank,
  inCharacterOrder,
} from "./character-order";

describe("character order", () => {
  it("follows the game's character select order", () => {
    expect([...CHARACTER_ORDER]).toEqual([
      "ironclad",
      "silent",
      "regent",
      "necrobinder",
      "defect",
    ]);
  });

  it("ranks ids in any casing and puts unknown ids last", () => {
    expect(characterRank("IRONCLAD")).toBe(0);
    expect(characterRank("CHARACTER.DEFECT")).toBe(4);
    expect(characterRank("colorless")).toBe(CHARACTER_ORDER.length);
  });

  it("sorts lists without reordering the unknown tail", () => {
    const ids = ["DEFECT", "colorless", "REGENT", "event", "IRONCLAD"];
    expect(inCharacterOrder(ids, (x) => x)).toEqual([
      "IRONCLAD",
      "REGENT",
      "DEFECT",
      "colorless",
      "event",
    ]);
  });
});
