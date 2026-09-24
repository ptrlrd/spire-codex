import { describe, expect, it } from "vitest";
import { stackCards } from "./deck-stack";
import { Card } from "./api/types";

const info = {
  STRIKE: { rarity: "Starter", name: "Strike" },
  BASH: { rarity: "Starter", name: "Bash" },
  WHIRLWIND: { rarity: "Rare", name: "Whirlwind" },
  ANGER: { rarity: "Common", name: "Anger" },
} as unknown as Record<string, Card>;

describe("deck stacks follow the order the deck was built", () => {
  it("orders by the floor a card joined, starters first, then pick order", () => {
    const deck = [
      { id: "STRIKE", floor_added_to_deck: 1 },
      { id: "BASH", floor_added_to_deck: 1 },
      { id: "WHIRLWIND", floor_added_to_deck: 9 },
      { id: "ANGER", floor_added_to_deck: 3 },
      { id: "STRIKE", floor_added_to_deck: 1 },
      { id: "ANGER", floor_added_to_deck: 3, current_upgrade_level: 1 },
      { id: "STRIKE", floor_added_to_deck: 12 },
    ];
    expect(
      stackCards(deck, info, (id) => id).map((s) => [
        s.id,
        s.upgraded,
        s.count,
        s.floor,
      ]),
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
      { id: "STRIKE", floor_added_to_deck: 1 },
      { id: "ANGER" },
      { id: "WHIRLWIND", floor_added_to_deck: 9 },
    ];
    expect(stackCards(deck, info, (id) => id).map((s) => s.id)).toEqual([
      "WHIRLWIND",
      "ANGER",
      "STRIKE",
    ]);
  });
});
