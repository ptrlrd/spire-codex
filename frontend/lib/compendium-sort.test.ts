import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/api/types";
import { cardMatchesSearch, compareCompendium } from "./compendium-sort";

function card(p: Partial<Card>): Card {
  return {
    id: "X",
    name: "X",
    color: "ironclad",
    rarity: "Common",
    rarity_key: "Common",
    type: "Attack",
    type_key: "Attack",
    cost: 1,
    description: "",
    ...p,
  } as Card;
}

describe("compareCompendium", () => {
  it("orders by pool, rarity, type, cost, then name", () => {
    const cards = [
      card({ id: "P", name: "P", type_key: "Power" }),
      card({ id: "S", name: "S", type_key: "Skill" }),
      card({ id: "A2", name: "A2", cost: 2 }),
      card({ id: "A1b", name: "B" }),
      card({ id: "A1a", name: "A" }),
      card({ id: "U", name: "U", rarity_key: "Uncommon" }),
      card({ id: "Sil", name: "Sil", color: "silent", rarity_key: "Basic" }),
    ];
    expect(cards.sort(compareCompendium).map((c) => c.id)).toEqual([
      "A1a",
      "A1b",
      "A2",
      "S",
      "P",
      "U",
      "Sil",
    ]);
  });
});

describe("cardMatchesSearch", () => {
  it("matches description text and every word", () => {
    const c = card({
      name: "All Is Well",
      description: "Whenever you create a [gold]Sadness[/gold], gain 4 Block.",
    });
    expect(cardMatchesSearch(c, "sadness")).toBe(true);
    expect(cardMatchesSearch(c, "sadness block")).toBe(true);
    expect(cardMatchesSearch(c, "sadness poison")).toBe(false);
  });
});
