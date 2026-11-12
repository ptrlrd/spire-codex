import { describe, expect, it } from "vitest";
import {
  CHARACTER_LABELS,
  CHARACTER_ORDER,
  characterLabel,
  characterRank,
  inCharacterOrder,
  isCharacter,
  needsMergedCatalog,
} from "./character-order";
import {
  CHARACTERS,
  CHARACTER_HEX,
  characterHex,
  colorTextClass,
  textColor,
} from "./character-colors";

describe("character order", () => {
  it("follows the game's character select order", () => {
    expect([...CHARACTER_ORDER]).toEqual([
      "ironclad",
      "silent",
      "regent",
      "necrobinder",
      "defect",
      "fool",
    ]);
  });

  it("names every character and knows which ones came after launch", () => {
    for (const id of CHARACTER_ORDER) {
      expect(CHARACTER_LABELS[id]).toBeTruthy();
      expect(isCharacter(id.toUpperCase())).toBe(true);
    }
    expect(characterLabel("CHARACTER.FOOL")).toBe("Fool");
    expect(characterLabel("watcher")).toBe("Watcher");
    expect(isCharacter("colorless")).toBe(false);
    expect(needsMergedCatalog("FOOL")).toBe(true);
    expect(needsMergedCatalog("ironclad")).toBe(false);
    expect(needsMergedCatalog("colorless")).toBe(false);
    expect(needsMergedCatalog(undefined)).toBe(false);
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

  it("gives every character a color, a text class and a text variable", () => {
    expect(CHARACTERS.map((c) => c.id)).toEqual([...CHARACTER_ORDER]);
    for (const c of CHARACTERS) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(characterHex(c.upper)).toBe(CHARACTER_HEX[c.id]);
      expect(colorTextClass(c.id)).toBe(`text-[var(--text-${c.id})]`);
      expect(textColor(c.hex)).toBe(`var(--text-${c.id})`);
    }
    expect(new Set(CHARACTERS.map((c) => c.hex)).size).toBe(CHARACTERS.length);
  });
});
