import { describe, expect, it } from "vitest";
import { isBetaRow } from "./beta-row";
import { cardRenderChannel } from "./card-fallback";

describe("isBetaRow", () => {
  it("reads a beta-only row from its versioned art path", () => {
    const fool = {
      image_url: "/static/images/beta/v0.113.0/cards/strike_fool.webp",
    };
    expect(isBetaRow(fool)).toBe(true);
    expect(cardRenderChannel(fool)).toBe("beta");
  });

  it("treats main rows and rows without art as main", () => {
    const bash = { image_url: "/static/images/cards/bash.webp" };
    expect(isBetaRow(bash)).toBe(false);
    expect(cardRenderChannel(bash)).toBe("stable");
    expect(isBetaRow({ image_url: null })).toBe(false);
    expect(cardRenderChannel(undefined)).toBe("stable");
  });
});
