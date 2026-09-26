import { describe, expect, it } from "vitest";
import { cardHasKeyword } from "./card-display";

describe("cardHasKeyword with untidy keyword arrays", () => {
  it("does not throw when keyword arrays contain null or undefined elements", () => {
    const cardWithNulls = {
      keywords: [null as unknown as string, "Erschöpft"],
      keywords_key: [undefined as unknown as string, "Exhaust"],
      upgrade: { add_innate: true },
    };
    expect(() => cardHasKeyword(cardWithNulls, "Exhaust")).not.toThrow();
    expect(cardHasKeyword(cardWithNulls, "Exhaust")).toBe(true);
    expect(cardHasKeyword(cardWithNulls, "Innate")).toBe(true);
  });
});
