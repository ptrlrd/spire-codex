import { describe, expect, it } from "vitest";
import { matchGridQuery, parseGridQuery } from "./grid-query";
import type { GridRow } from "@/app/[locale]/stats/_grid/types";

function row(overrides: Partial<GridRow> = {}): GridRow {
  return {
    key: "x",
    id: "x",
    href: null,
    name: "Strike",
    sub: "Attack",
    group: "red",
    rarity: "common",
    hint: null,
    subNote: null,
    color: null,
    imageUrl: null,
    upgraded: false,
    wax: false,
    playedBy: null,
    parent: null,
    n: 100,
    score: 50,
    elo: 1500,
    winRate: 50,
    winRateCi: null,
    pickRate: 10,
    holdRate: 80,
    useRate: 5,
    buyRate: 40,
    share: 25,
    lowHpShare: 12,
    lift: 2,
    liftN: null,
    offered: 300,
    picked: 30,
    wins: 50,
    losses: 50,
    pickAct1: 1,
    pickAct2: 2,
    pickAct3: 3,
    ...overrides,
  };
}

function matches(input: string, r: GridRow): boolean {
  const { ast } = parseGridQuery(input);
  return matchGridQuery(ast, r);
}

describe("plain words and phrases", () => {
  it("matches name or sub case-insensitively", () => {
    expect(matches("strike", row())).toBe(true);
    expect(matches("STRIKE", row())).toBe(true);
    expect(matches("attack", row())).toBe(true);
    expect(matches("body", row())).toBe(false);
  });

  it("matches quoted phrases exactly as substrings", () => {
    expect(matches('"Strike"', row())).toBe(true);
    expect(matches('"body slam"', row({ name: "Body Slam" }))).toBe(true);
    expect(matches('"slam body"', row({ name: "Body Slam" }))).toBe(false);
  });
});

describe("operators", () => {
  it("ands space separated terms", () => {
    expect(matches("strike attack", row())).toBe(true);
    expect(matches("strike defend", row())).toBe(false);
  });

  it("ors terms", () => {
    expect(matches("strike OR nothing", row())).toBe(true);
    expect(matches("nothing or nothing2", row())).toBe(false);
  });

  it("groups with parentheses", () => {
    expect(matches("(strike OR nothing) rarity:common", row())).toBe(true);
    expect(matches("(strike OR nothing) rarity:rare", row())).toBe(false);
  });

  it("negates terms", () => {
    expect(matches("-rarity:common", row())).toBe(false);
    expect(matches("-rarity:rare", row())).toBe(true);
    expect(matches('-"strike"', row())).toBe(false);
  });

  it("supports every numeric operator", () => {
    expect(matches("lift>1", row())).toBe(true);
    expect(matches("lift>2", row())).toBe(false);
    expect(matches("lift>=2", row())).toBe(true);
    expect(matches("lift<3", row())).toBe(true);
    expect(matches("lift<=1", row())).toBe(false);
    expect(matches("lift=2", row())).toBe(true);
    expect(matches("lift!=2", row())).toBe(false);
    expect(matches("lift:2", row())).toBe(true);
    expect(matches("lift>1.5", row())).toBe(true);
  });

  it("ignores a percent sign after numbers", () => {
    expect(matches("win>45%", row({ winRate: 50 }))).toBe(true);
    expect(matches("win>55%", row({ winRate: 50 }))).toBe(false);
  });

  it("treats : as substring and = as exact for text fields", () => {
    expect(matches("rarity:comm", row())).toBe(true);
    expect(matches("rarity=common", row())).toBe(true);
    expect(matches("rarity=Common", row())).toBe(true);
    expect(matches("rarity=comm", row())).toBe(false);
    expect(matches("r:common", row())).toBe(true);
  });

  it("supports flags", () => {
    expect(matches("is:upgraded", row({ upgraded: true }))).toBe(true);
    expect(matches("is:upgraded", row())).toBe(false);
    expect(matches("-is:wax", row({ wax: true }))).toBe(false);
  });
});

describe("null handling", () => {
  it("never matches numeric comparisons on null fields, including !=", () => {
    expect(matches("lift>0", row({ lift: null }))).toBe(false);
    expect(matches("lift!=5", row({ lift: null }))).toBe(false);
    expect(matches("lift:1", row({ lift: null }))).toBe(false);
  });
});

describe("errors and unknown fields", () => {
  it("reports unknown fields and ignores just that term", () => {
    const parsed = parseGridQuery("foo:bar lift>1");
    expect(parsed.error).toBeNull();
    expect(parsed.unknown).toEqual(["foo"]);
    expect(matchGridQuery(parsed.ast, row({ lift: 5 }))).toBe(true);
  });

  it("falls back to plain text on unbalanced parentheses", () => {
    const parsed = parseGridQuery("(lift>1");
    expect(parsed.error).not.toBeNull();
    expect(parsed.ast).toBeNull();
  });

  it("falls back on a dangling operator", () => {
    const parsed = parseGridQuery("lift>");
    expect(parsed.error).not.toBeNull();
  });

  it("returns a null ast for an empty query", () => {
    const parsed = parseGridQuery("   ");
    expect(parsed.ast).toBeNull();
    expect(parsed.error).toBeNull();
  });
});
