import { describe, expect, it } from "vitest";
import { rankWinRateTiers, tierForRank } from "./pool-tiers";

const rates = (pairs: [string, number | null][]) => new Map(pairs);

describe("tierForRank", () => {
  it("spreads ten entries across every letter with S on top and F at the bottom", () => {
    const letters = Array.from({ length: 10 }, (_, i) => tierForRank(i, 10));
    expect(letters).toEqual(["S", "A", "A", "B", "B", "C", "C", "D", "D", "F"]);
  });

  it("keeps S and F at the ends of a tiny pool", () => {
    expect(Array.from({ length: 3 }, (_, i) => tierForRank(i, 3))).toEqual([
      "S",
      "B",
      "F",
    ]);
    expect(Array.from({ length: 2 }, (_, i) => tierForRank(i, 2))).toEqual([
      "S",
      "F",
    ]);
  });
});

describe("rankWinRateTiers", () => {
  it("grades the Neow pool by win rate instead of the flat score", () => {
    const ids = ["SCROLL", "SHEARS", "POULTICE", "BOOTS"];
    const tiers = rankWinRateTiers(
      ids,
      rates([
        ["SCROLL", 46.5],
        ["SHEARS", 39.84],
        ["POULTICE", 37.9],
        ["BOOTS", 19.9],
      ]),
    );
    expect(tiers.get("SCROLL")).toEqual({ tier: "S", value: 46.5 });
    expect(tiers.get("SHEARS")).toEqual({ tier: "B", value: 39.8 });
    expect(tiers.get("POULTICE")).toEqual({ tier: "C", value: 37.9 });
    expect(tiers.get("BOOTS")).toEqual({ tier: "F", value: 19.9 });
  });

  it("gives tied rates the better letter and leaves unrated ids out", () => {
    const tiers = rankWinRateTiers(
      ["A", "B", "C", "D"],
      rates([
        ["A", 40],
        ["B", 40],
        ["C", 30],
        ["D", null],
      ]),
    );
    expect(tiers.get("A")?.tier).toBe("S");
    expect(tiers.get("B")?.tier).toBe("S");
    expect(tiers.get("C")?.tier).toBe("F");
    expect(tiers.has("D")).toBe(false);
  });

  it("refuses to grade a pool with fewer than two rated relics", () => {
    expect(
      rankWinRateTiers(
        ["A", "B"],
        rates([
          ["A", 40],
          ["B", null],
        ]),
      ).size,
    ).toBe(0);
  });
});
