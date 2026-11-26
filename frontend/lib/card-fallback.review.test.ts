import { describe, expect, it } from "vitest";
import { cardImageChain, humanizeCardId } from "./card-fallback";

describe("humanizeCardId edge cases", () => {
  it("handles lowercase card. prefix properly", () => {
    expect(humanizeCardId("card.strike_ironclad")).toBe("Strike Ironclad");
  });
});

describe("cardImageChain security and i18n fallbacks", () => {
  it("keeps catalog art when the id is unsafe for generated render URLs", () => {
    const chain = cardImageChain("mod/card", { art: "cards/mod_card.png" });
    expect(chain).toHaveLength(1);
    expect(chain[0]).toContain("mod_card.png");
    expect(cardImageChain("mod/card")).toEqual([]);
  });

  it("includes English beta fallback when channel is stable and lang is non-English", () => {
    const chain = cardImageChain("strike_ironclad", {
      channel: "stable",
      lang: "deu",
    });
    const betaDeu = chain.find(
      (u) => u.includes("/beta/") && u.includes("/deu/"),
    );
    const betaEn = chain.find(
      (u) => u.includes("/beta/") && !u.includes("/deu/"),
    );
    expect(betaDeu).toBeDefined();
    expect(betaEn).toBeDefined();
    expect(chain.indexOf(betaDeu!)).toBeLessThan(chain.indexOf(betaEn!));
  });
});
