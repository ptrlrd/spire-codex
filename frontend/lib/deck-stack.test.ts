import { describe, expect, it } from "vitest";
import { stackCards } from "./deck-stack";

const info = {
  STRIKE: { rarity: "Starter", name: "Strike" },
  BASH: { rarity: "Starter", name: "Bash" },
  WHIRLWIND: { rarity: "Rare", name: "Whirlwind" },
  ANGER: { rarity: "Common", name: "Anger" },
};

describe("deck stacks follow the order the deck was built", () => {
  it("orders by the floor a card joined, starters first, then pick order", () => {
    const deck = [
      { id: "CARD.STRIKE", floor_added_to_deck: 1 },
      { id: "CARD.BASH", floor_added_to_deck: 1 },
      { id: "CARD.WHIRLWIND", floor_added_to_deck: 9 },
      { id: "CARD.ANGER", floor_added_to_deck: 3 },
      { id: "CARD.STRIKE", floor_added_to_deck: 1 },
      { id: "CARD.ANGER", floor_added_to_deck: 3, current_upgrade_level: 1 },
      { id: "CARD.STRIKE", floor_added_to_deck: 12 },
    ];
    expect(
      stackCards(deck, info).map((s) => [s.id, s.upgraded, s.count, s.floor]),
    ).toEqual([
      ["STRIKE", false, 3, 1],
      ["BASH", false, 1, 1],
      ["ANGER", false, 1, 3],
      ["ANGER", true, 1, 3],
      ["WHIRLWIND", false, 1, 9],
    ]);
  });

  it("falls back to rarity then name when any card lacks the floor", () => {
    const deck = [
      { id: "CARD.STRIKE", floor_added_to_deck: 1 },
      { id: "CARD.ANGER" },
      { id: "CARD.WHIRLWIND", floor_added_to_deck: 9 },
    ];
    expect(stackCards(deck, info).map((s) => s.id)).toEqual([
      "WHIRLWIND",
      "ANGER",
      "STRIKE",
    ]);
  });
});
