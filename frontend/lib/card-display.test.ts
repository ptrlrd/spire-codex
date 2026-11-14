import { describe, expect, it } from "vitest";
import type { Card } from "./api/types";
import { cardHasKeyword, getCardDisplayModel } from "./card-display";

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
    can_be_generated_in_combat: null,
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

    expect(display.descriptionText).toBe(
      "Whenever you play a card, gain 1 Block.",
    );
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

    expect(display.descriptionText).toBe(
      "Deal [green]4[/green] damage. Gain [green]4[/green] Block.",
    );
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

describe("cardHasKeyword", () => {
  const tyranny = {
    keywords: ["Erschöpft"],
    keywords_key: ["Exhaust"],
    upgrade: { add_innate: true },
  };

  it("matches base keywords by localized name or English key", () => {
    expect(cardHasKeyword(tyranny, "Exhaust")).toBe(true);
    expect(cardHasKeyword(tyranny, "erschöpft")).toBe(true);
  });

  it("matches a keyword the upgrade adds", () => {
    expect(cardHasKeyword(tyranny, "Innate")).toBe(true);
    expect(
      cardHasKeyword(
        { keywords: null, keywords_key: null, upgrade: { add_retain: true } },
        "Retain",
      ),
    ).toBe(true);
  });

  it("does not match keywords the card never has", () => {
    expect(cardHasKeyword(tyranny, "Retain")).toBe(false);
    expect(
      cardHasKeyword(
        { keywords: null, keywords_key: null, upgrade: null },
        "Innate",
      ),
    ).toBe(false);
    expect(cardHasKeyword(tyranny, "")).toBe(false);
  });
});

describe("plural forms left unresolved in the data", () => {
  it("picks the Russian form for the count", () => {
    const card = createCard({
      description: "Вы добираете 3 plural(ru):карту.",
      description_raw:
        "Вы добираете {Cards:diff()} {Cards:plural(ru):карту|карты|карт}.",
      vars: { Cards: 3 },
      upgrade: { cards: "+2" },
      upgrade_description: "Вы добираете 5 plural(ru):карту.",
    });
    expect(
      getCardDisplayModel(card, false, { lang: "rus" }).descriptionText,
    ).toBe("Вы добираете 3 карты.");
    expect(
      getCardDisplayModel(card, true, { lang: "rus" }).descriptionText,
    ).toBe("Вы добираете [green]5[/green] карт.");
  });

  it("resolves an upgrade condition nested in a Polish form", () => {
    const card = createCard({
      description: "Dodaj 2 [gold]Noże|Noży[/gold] do [gold]ręki[/gold].",
      description_raw:
        "Dodaj {Shivs:diff()} [gold]{Cards:plural:{IfUpgraded:show:Nóż+|Nóż}|{IfUpgraded:show:Noże+|Noże}|{IfUpgraded:show:Noży+|Noży}}[/gold] do [gold]ręki[/gold].",
      vars: { Shivs: 2, Cards: 2 },
      upgrade: { description_changed: true },
      upgrade_description:
        "Dodaj 2 [gold]Noże+|Noży+[/gold] do [gold]ręki[/gold].",
    });
    expect(
      getCardDisplayModel(card, false, { lang: "pol" }).descriptionText,
    ).toBe("Dodaj 2 [gold]Noże[/gold] do [gold]ręki[/gold].");
    expect(
      getCardDisplayModel(card, true, { lang: "pol" }).descriptionText,
    ).toBe("Dodaj 2 [gold]Noże+[/gold] do [gold]ręki[/gold].");
  });

  it("keeps several plural spots in one sentence apart", () => {
    const card = createCard({
      description:
        "plural(ru):Следующая карта, разыгранная plural(ru):другим игроком, plural(ru):бесплатная.",
      description_raw:
        "{Cards:plural(ru):Следующая карта, разыгранная|Следующие {:diff()} карты, разыгранные|Следующие {:diff()} карт, разыгранные} {Cards:plural(ru):другим игроком|другими игроками|другими игроками}, {Cards:plural(ru):бесплатная|бесплатные|бесплатные}.",
      vars: { Cards: 4 },
    });
    expect(
      getCardDisplayModel(card, false, { lang: "rus" }).descriptionText,
    ).toBe("Следующие 4 карты, разыгранные другими игроками, бесплатные.");
  });
});
