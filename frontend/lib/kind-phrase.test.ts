import { describe, expect, it } from "vitest";
import { kindPhrase } from "./kind-phrase";

describe("kindPhrase", () => {
  it("drops a qualifier that already ends in the noun", () => {
    expect(kindPhrase("relic", "Rare Relic")).toBe("a Rare relic");
    expect(kindPhrase("relic", "Ancient Relic")).toBe("an Ancient relic");
    expect(kindPhrase("relic", "Relic")).toBe("a relic");
  });

  it("drops a qualifier that is the noun itself", () => {
    expect(kindPhrase("event", "Event")).toBe("an event");
    expect(kindPhrase("event", "Shared")).toBe("a Shared event");
    expect(kindPhrase("run-end badge", "")).toBe("a run-end badge");
  });

  it("says a repeated qualifier once", () => {
    expect(kindPhrase("card", "1-cost", "Event", "Event", "Attack")).toBe(
      "a 1-cost Event Attack card",
    );
    expect(kindPhrase("card", "Curse", "Curse", "Curse")).toBe("a Curse card");
    expect(kindPhrase("card", "Token", "Status", "Status")).toBe(
      "a Token Status card",
    );
  });

  it("picks the article from the first word", () => {
    expect(kindPhrase("potion", "Uncommon")).toBe("an Uncommon potion");
    expect(kindPhrase("monster", "Elite")).toBe("an Elite monster");
    expect(kindPhrase("card", "X-cost", "Rare", "Skill")).toBe(
      "an X-cost Rare Skill card",
    );
    expect(kindPhrase("card", "0-cost", "Ironclad", "Common", "Attack")).toBe(
      "a 0-cost Ironclad Common Attack card",
    );
    expect(kindPhrase("potion", null, undefined)).toBe("a potion");
  });
});
