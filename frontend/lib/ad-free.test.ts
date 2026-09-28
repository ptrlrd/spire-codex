import { describe, expect, it } from "vitest";
import { isAdFree, stripLangPrefix } from "./ad-free";

describe("ad-free pages match with or without a locale prefix", () => {
  it("keeps only the admin console ad-free in every language", () => {
    expect(isAdFree("/admin")).toBe(true);
    expect(isAdFree("/jpn/admin")).toBe(true);
    expect(isAdFree("/deu/admin/x")).toBe(true);
  });

  it("shows ads everywhere else, tools included", () => {
    expect(isAdFree("/cards")).toBe(false);
    expect(isAdFree("/deu/cards")).toBe(false);
    expect(isAdFree("/deck-builder")).toBe(false);
    expect(isAdFree("/seed-finder")).toBe(false);
    expect(isAdFree("/administration")).toBe(false);
    expect(isAdFree(null)).toBe(false);
  });

  it("only strips a real language code", () => {
    expect(stripLangPrefix("/deu/cards")).toBe("/cards");
    expect(stripLangPrefix("/cards/strike")).toBe("/cards/strike");
    expect(stripLangPrefix("/xyz/cards")).toBe("/xyz/cards");
  });
});
