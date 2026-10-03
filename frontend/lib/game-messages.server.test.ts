import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGameTranslator,
  fetchGameTables,
  pickGameMessages,
  tryGameMessage,
} from "./game-messages.server";

const tables = {
  cards: {
    STRIKE: { title: "Strike", description: "Deal {Damage} damage." },
    BASH: { title: "Bash", description: "Deal {Damage} damage." },
  },
  events: {
    MORPHIC_GROVE: {
      title: "Morphic Grove",
      pages: {
        INITIAL: {
          description: "Long text",
          options: {
            LONER: { title: "Loner", description: "Alone" },
            LEAVE: { title: "Leave", description: "" },
          },
        },
      },
    },
  },
  map: { LEGEND_UNKNOWN: { title: "Unknown" } },
};

describe("pickGameMessages", () => {
  it("keeps only the listed entries and leaves, plus whole tables", () => {
    const picked = pickGameMessages(
      tables,
      {
        cards: ["STRIKE.title", "MISSING.title"],
        events: [
          "MORPHIC_GROVE.title",
          "MORPHIC_GROVE.pages.INITIAL.options.LONER.title",
        ],
        relics: ["AKABEKO.title"],
      },
      { whole: ["map"] },
    );
    expect(picked).toEqual({
      cards: { STRIKE: { title: "Strike" } },
      events: {
        MORPHIC_GROVE: {
          title: "Morphic Grove",
          pages: { INITIAL: { options: { LONER: { title: "Loner" } } } },
        },
      },
      relics: {},
      map: { LEGEND_UNKNOWN: { title: "Unknown" } },
    });
    expect(
      tables.events.MORPHIC_GROVE.pages.INITIAL.options.LEAVE,
    ).toBeDefined();
  });

  it("copies a whole record for a bare id", () => {
    expect(pickGameMessages(tables, { cards: ["BASH"] })).toEqual({
      cards: { BASH: tables.cards.BASH },
    });
  });
});

describe("createGameTranslator", () => {
  const pack = {
    cards: { STRIKE: { title: "Strike" } },
    run_history: {
      MAP_POINT_HISTORY: {
        turnsTaken: "{Turns} {Turns, plural, one {Turn} other {Turns}}",
      },
    },
    gameplay_ui: {
      COMBAT_REWARD_CARD_REMOVAL: {
        "!": "Remove a card from your deck.",
        selectionScreenPrompt: "Choose a card to remove.",
      },
    },
  };
  const t = createGameTranslator(pack, "eng");

  it("reads keys under the game root", () => {
    expect(t("cards.STRIKE.title")).toBe("Strike");
    expect(t.has("cards.STRIKE.title")).toBe(true);
    expect(t.has("cards.BASH.title")).toBe(false);
  });

  it("formats ICU plurals with values", () => {
    expect(t("run_history.MAP_POINT_HISTORY.turnsTaken", { Turns: 1 })).toBe(
      "1 Turn",
    );
    expect(t("run_history.MAP_POINT_HISTORY.turnsTaken", { Turns: 4 })).toBe(
      "4 Turns",
    );
  });

  it("resolves a key that is both leaf and namespace through its ! leaf", () => {
    expect(tryGameMessage(t, "gameplay_ui.COMBAT_REWARD_CARD_REMOVAL")).toBe(
      "Remove a card from your deck.",
    );
    expect(
      tryGameMessage(
        t,
        "gameplay_ui.COMBAT_REWARD_CARD_REMOVAL.selectionScreenPrompt",
      ),
    ).toBe("Choose a card to remove.");
    expect(tryGameMessage(t, "cards.STRIKE")).toBeUndefined();
    expect(tryGameMessage(t, "cards.BASH.title")).toBeUndefined();
  });
});

describe("fetchGameTables", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches each table once and turns failures into empty tables", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url.includes("/localizations/cards?")) {
        return new Response(JSON.stringify({ STRIKE: { title: "Strike" } }), {
          status: 200,
        });
      }
      if (url.includes("/localizations/relics?")) throw new Error("boom");
      return new Response("nope", { status: 404 });
    });
    const out = await fetchGameTables(["cards", "relics", "potions", "cards"], {
      locale: "deu",
      channel: "beta",
    });
    expect(out).toEqual({
      cards: { STRIKE: { title: "Strike" } },
      relics: {},
      potions: {},
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatch(
      /\/api\/localizations\/cards\?lang=deu&channel=beta$/,
    );
  });
});
