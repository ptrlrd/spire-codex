import { describe, expect, it } from "vitest";
import {
  gradePool,
  poolWinRate,
  rankWinRateTiers,
  tierForRank,
  type PoolEntity,
} from "./pool-tiers";

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
    expect(tierForRank(0, 1)).toBe("S");
  });
});

describe("poolWinRate", () => {
  it("rounds to the displayed precision and drops thin or broken samples", () => {
    expect(poolWinRate({ win_rate: 39.84, picks: 64845 })).toBe(39.8);
    expect(poolWinRate({ win_rate: 0, picks: 3 })).toBeNull();
    expect(poolWinRate({ win_rate: 61.2, picks: 199 })).toBeNull();
    expect(poolWinRate({ win_rate: NaN, picks: 5000 })).toBeNull();
    expect(poolWinRate({ win_rate: null, picks: 5000 })).toBeNull();
    expect(poolWinRate(undefined)).toBeNull();
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

  it("treats rates that display the same as a tie", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `R${i}`);
    const input: [string, number][] = ids.map((id, i) => [id, 40 - i * 2]);
    input[0] = ["R0", 40.04];
    input[1] = ["R1", 39.96];
    const tiers = rankWinRateTiers(ids, rates(input));
    expect(tiers.get("R0")).toEqual({ tier: "S", value: 40 });
    expect(tiers.get("R1")).toEqual({ tier: "S", value: 40 });
    expect(tiers.get("R2")?.tier).toBe("A");
  });

  it("grades a single rated relic S and an all-tied pool all S", () => {
    expect(
      rankWinRateTiers(
        ["A", "B"],
        rates([
          ["A", 40],
          ["B", null],
        ]),
      ),
    ).toEqual(new Map([["A", { tier: "S", value: 40 }]]));
    const tied = rankWinRateTiers(
      ["A", "B", "C"],
      rates([
        ["A", 0],
        ["B", 0],
        ["C", 0],
      ]),
    );
    expect([...tied.values()].map((v) => v.tier)).toEqual(["S", "S", "S"]);
  });

  it("ignores NaN rates", () => {
    const tiers = rankWinRateTiers(
      ["A", "B", "C"],
      rates([
        ["A", 50],
        ["B", NaN],
        ["C", 40],
      ]),
    );
    expect(tiers.has("B")).toBe(false);
    expect(tiers.get("C")?.tier).toBe("F");
  });
});

describe("gradePool", () => {
  const entity = (id: string, score: number | null): PoolEntity => ({
    id,
    score,
  });

  it("sends thin samples to Unrated instead of banding their Codex Score", () => {
    const pool = [entity("massive_scroll", 26), entity("hefty_tablet", 0)];
    gradePool(pool, {
      MASSIVE_SCROLL: { win_rate: 0, picks: 3 },
      HEFTY_TABLET: { win_rate: 12.9, picks: 83337 },
    });
    expect(pool[0]).toEqual({
      id: "massive_scroll",
      score: null,
      tier: null,
      value: null,
    });
    expect(pool[1]).toEqual({
      id: "hefty_tablet",
      score: 0,
      tier: "S",
      value: 12.9,
    });
  });

  it("leaves every relic unrated when nothing clears the floor", () => {
    const pool = [entity("a", 73), entity("b", 18)];
    gradePool(pool, {
      A: { win_rate: 61.2, picks: 199 },
      B: { win_rate: 58.9, picks: 3 },
    });
    expect(pool.map((e) => e.score)).toEqual([null, null]);
    expect(pool.map((e) => e.tier)).toEqual([null, null]);
  });
});
