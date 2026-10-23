import { describe, expect, it } from "vitest";
import { lookupGameMessage } from "./game-messages.common";
import { createGameTranslator } from "./game-messages.server";

const t = createGameTranslator(
  {
    cards: { STRIKE: { title: "Strike", description: "" } },
    events: {
      GIFT: {
        pages: { ALL: { options: { TAKE: { title: "Give {Relic}" } } } },
      },
    },
    run_history: {
      MAP_POINT_HISTORY: {
        turnsTaken: "{Turns} {Turns, plural, one {Turn} other {Turns}}",
        broken: "{Turns, plural, one {Turn} other {Turns}",
      },
    },
    gameplay_ui: {
      REMOVAL: { "!": "Remove a card.", prompt: "Choose." },
      EMPTY: { "!": "", prompt: "Choose." },
    },
  },
  "eng",
);

describe("lookupGameMessage", () => {
  it("formats ICU values", () => {
    expect(
      lookupGameMessage(t, "run_history.MAP_POINT_HISTORY.turnsTaken", {
        Turns: 3,
      }),
    ).toBe("3 Turns");
  });

  it("fills arguments the run cannot supply", () => {
    expect(
      lookupGameMessage(t, "events.GIFT.pages.ALL.options.TAKE.title"),
    ).toBe("Give Relic");
  });

  it("is undefined for a missing key and for a bare namespace", () => {
    expect(lookupGameMessage(t, "cards.BASH.title")).toBeUndefined();
    expect(lookupGameMessage(t, "cards.STRIKE")).toBeUndefined();
    expect(lookupGameMessage(t, "")).toBeUndefined();
  });

  it("reads the ! leaf of a key that is also a namespace", () => {
    expect(lookupGameMessage(t, "gameplay_ui.REMOVAL")).toBe("Remove a card.");
    expect(lookupGameMessage(t, "gameplay_ui.REMOVAL.prompt")).toBe("Choose.");
  });

  it("treats an empty string, an empty ! leaf and a formatter failure as missing", () => {
    expect(lookupGameMessage(t, "cards.STRIKE.description")).toBeUndefined();
    expect(lookupGameMessage(t, "gameplay_ui.EMPTY")).toBeUndefined();
    expect(
      lookupGameMessage(t, "run_history.MAP_POINT_HISTORY.broken", {
        Turns: 2,
      }),
    ).toBeUndefined();
  });
});
