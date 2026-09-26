import { describe, expect, it } from "vitest";
import { cardImageChain, humanizeCardId, safeCardId } from "./card-fallback";

describe("humanizeCardId", () => {
  it("title-cases catalog-style ids", () => {
    expect(humanizeCardId("SWORD_BOOMERANG")).toBe("Sword Boomerang");
    expect(humanizeCardId("CARD.STRIKE_IRONCLAD")).toBe("Strike Ironclad");
  });

  it("strips mod namespaces", () => {
    expect(humanizeCardId("mod:GHOST_STRIKE")).toBe("Ghost Strike");
    expect(humanizeCardId("SomeMod.Cards.SoulBlade")).toBe("Soul Blade");
  });

  it("keeps the upgrade marker", () => {
    expect(humanizeCardId("BASH_PLUS")).toBe("Bash+");
    expect(humanizeCardId("bash+")).toBe("Bash+");
  });

  it("returns the raw id when it is not a bare identifier", () => {
    expect(humanizeCardId("weird id!")).toBe("weird id!");
    expect(humanizeCardId("")).toBe("");
    expect(humanizeCardId(undefined)).toBe("");
  });
});

describe("safeCardId", () => {
  it("rejects path-like ids", () => {
    expect(safeCardId("../x")).toBe(false);
    expect(safeCardId("a/b")).toBe(false);
    expect(safeCardId("")).toBe(false);
    expect(safeCardId("STRIKE")).toBe(true);
  });
});

describe("cardImageChain", () => {
  it("tries enchanted, localized, english, beta, then portrait art", () => {
    const chain = cardImageChain("Strike_Ironclad", {
      enchantment: "sharp",
      lang: "deu",
      art: "/static/images/cards/strike.png",
    });
    expect(chain[0]).toMatch(/ench\/sharp\/strike_ironclad\.webp$/);
    expect(chain[1]).toMatch(/cards-full\/stable\/deu\/strike_ironclad\.webp$/);
    expect(chain[2]).toMatch(/cards-full\/stable\/strike_ironclad\.webp$/);
    expect(chain[3]).toMatch(/cards-full\/beta\/.*strike_ironclad\.webp$/);
    expect(chain[4]).toMatch(/strike\.png$/);
    expect(new Set(chain).size).toBe(chain.length);
  });

  it("is empty for unsafe ids", () => {
    expect(cardImageChain("../etc")).toEqual([]);
  });

  it("does not add a beta step on the beta channel", () => {
    const chain = cardImageChain("x", { channel: "beta" });
    expect(chain.filter((u) => u.includes("/beta/")).length).toBe(1);
  });
});
