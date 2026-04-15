import { describe, expect, it } from "vitest";
import type { Card } from "./api";
import { getCardDisplayModel } from "./card-display";

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-card",
    name: "Test Card",
    description: "Deal 6 damage.",
    description_raw: null,
    cost: 1,
    is_x_cost: false,
    is_x_star_cost: false,
    star_cost: null,
    type: "Attack",
    type_key: null,
    rarity: "Common",
    rarity_key: null,
    target: "Enemy",
    color: "ironclad",
    damage: 6,
    block: null,
    hit_count: null,
    powers_applied: null,
    cards_draw: null,
    energy_gain: null,
    hp_loss: null,
    keywords: null,
    keywords_key: null,
    tags: null,
    spawns_cards: null,
    vars: { Damage: 6 },
    upgrade: null,
    upgrade_description: null,
    image_url: null,
    beta_image_url: null,
    type_variants: null,
    compendium_order: 1,
    ...overrides,
  };
}

describe("getCardDisplayModel", () => {
  it("keeps keyword text separate from the main description", () => {
    const card = createCard({
      description: "Whenever you play a card, gain 1 Block.",
      damage: null,
      block: 1,
      vars: { Block: 1 },
      upgrade: { add_innate: true },
    });

    const display = getCardDisplayModel(card, true);

    expect(display.descriptionText).toBe("Whenever you play a card, gain 1 Block.");
    expect(display.keywordText).toBe("[green]Innate[/green].");
    expect(display.addedKeywords).toEqual(["Innate"]);
  });

  it("highlights repeated upgraded values in the description body", () => {
    const card = createCard({
      description: "Deal 3 damage. Gain 3 Block.",
      damage: 3,
      block: 3,
      vars: { Damage: 3, Block: 3 },
      upgrade: { damage: "+1", block: "+1" },
    });

    const display = getCardDisplayModel(card, true);

    expect(display.descriptionText).toBe("Deal [green]4[/green] damage. Gain [green]4[/green] Block.");
    expect(display.keywordText).toBe("");
  });

  it("removes hidden keywords from the visible keyword output", () => {
    const card = createCard({
      description: "Gain 8 Block.",
      damage: null,
      block: 8,
      keywords: ["Exhaust"],
      vars: { Block: 8 },
      upgrade: { remove_exhaust: true, add_innate: true },
    });

    const display = getCardDisplayModel(card, true);

    expect(display.visibleKeywords).toEqual([]);
    expect(display.addedKeywords).toEqual(["Innate"]);
    expect(display.removedKeywords).toEqual(["Exhaust"]);
    expect(display.keywordText).toBe("[green]Innate[/green].");
  });

it("highlights values inside upgrade_description without replacing from the base description", () => {
  const card = createCard({
    description: "Draw 1 card.",
    damage: null,
    block: null,
    vars: { Draw: 1 },
    upgrade: { draw: "+1" },
    upgrade_description: "Draw 2 cards.",
  });

  const display = getCardDisplayModel(card, true);

  expect(display.descriptionText).toBe("Draw [green]2[/green] cards.");
  expect(display.keywordText).toBe("");
  });
  
});
