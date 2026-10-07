import { describe, expect, it } from "vitest";
import { gridQueryFlags, matchGridQuery, parseGridQuery } from "./grid-query";
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
    expect(matches("name:stri", row())).toBe(true);
    expect(matches("type:att", row())).toBe(true);
    expect(matches("rarity=common", row())).toBe(true);
    expect(matches("rarity=Common", row())).toBe(true);
    expect(matches("rarity=comm", row())).toBe(false);
    expect(matches("r:common", row())).toBe(true);
  });

  it("reads quoted text field values with spaces", () => {
    const slam = row({ name: "Body Slam" });
    expect(matches('name:"body slam"', slam)).toBe(true);
    expect(matches('name="body slam"', slam)).toBe(true);
    expect(matches('-name:"body slam"', slam)).toBe(false);
    expect(matches('name:"body slam" lift>1', slam)).toBe(true);
    expect(parseGridQuery('name:"body slam').error).not.toBeNull();
  });

  it("supports flags", () => {
    expect(matches("is:upgraded", row({ upgraded: true }))).toBe(true);
    expect(matches("is:upgraded", row())).toBe(false);
    expect(matches("-is:wax", row({ wax: true }))).toBe(false);
  });
});

describe("flags in a query", () => {
  it("collects only the flags a row must have", () => {
    const flags = (q: string) => [...gridQueryFlags(parseGridQuery(q).ast)];
    expect(flags("is:upgraded lift>1")).toEqual(["upgraded"]);
    expect(flags("(strike OR -is:wax) is:upgraded")).toEqual(["upgraded"]);
    expect(flags("-(-is:wax)")).toEqual(["wax"]);
    expect(flags("lift>1")).toEqual([]);
    expect(flags("")).toEqual([]);
  });
});

describe("query grammar edge cases", () => {
  it("keeps operators inside quoted phrases literal", () => {
    expect(
      matches('"lift>2"', row({ name: "Lift>2", sub: null, lift: 0 })),
    ).toBe(true);
    expect(
      matches('"lift>2"', row({ name: "Strike", sub: "Attack", lift: 3 })),
    ).toBe(false);
    expect(matches('"a=b"', row({ name: "A=B", sub: null }))).toBe(true);
    expect(matches('"a=b"', row({ name: "Strike", sub: "Attack" }))).toBe(
      false,
    );
  });

  it("rejects a missing OR operand or an empty group", () => {
    expect(parseGridQuery("OR strike").error).not.toBeNull();
    expect(parseGridQuery("strike OR").error).not.toBeNull();
    expect(parseGridQuery("()").error).not.toBeNull();
    expect(parseGridQuery("(strike OR ())").error).not.toBeNull();
  });

  it("ignores an unknown term on either side of OR", () => {
    for (const q of ["strike OR bogus:value", "bogus:value OR strike"]) {
      const parsed = parseGridQuery(q);
      expect(parsed.error).toBeNull();
      expect(parsed.unknown).toEqual(["bogus"]);
      expect(matchGridQuery(parsed.ast, row())).toBe(true);
      expect(
        matchGridQuery(parsed.ast, row({ name: "Defend", sub: "Skill" })),
      ).toBe(false);
    }
  });

  it("matches nothing when every term is unknown", () => {
    const parsed = parseGridQuery("rarit:rare is:shiny");
    expect(parsed.error).toBeNull();
    expect(parsed.unknown).toEqual(["rarit", "is:shiny"]);
    expect(matchGridQuery(parsed.ast, row())).toBe(false);
  });

  it("does not let missing values satisfy negated comparisons", () => {
    expect(matches("-lift>2", row({ lift: null }))).toBe(false);
    expect(matches("-lift!=2", row({ lift: null }))).toBe(false);
    expect(matches("-lift>2", row({ lift: 1 }))).toBe(true);
    expect(matches("strike OR lift>2", row({ lift: null }))).toBe(true);
  });

  it("negates parenthesized groups", () => {
    const parsed = parseGridQuery("-(strike OR defend)");
    expect(parsed.error).toBeNull();
    expect(matchGridQuery(parsed.ast, row({ name: "Strike" }))).toBe(false);
    expect(
      matchGridQuery(parsed.ast, row({ name: "Defend", sub: "Skill" })),
    ).toBe(false);
    expect(
      matchGridQuery(parsed.ast, row({ name: "Bash", sub: "Attack" })),
    ).toBe(true);
  });

  it("rejects empty phrases and text glued to a closing quote", () => {
    expect(parseGridQuery('""').error).not.toBeNull();
    expect(parseGridQuery('rarity:rare OR ""').error).not.toBeNull();
    expect(parseGridQuery('name:""').error).not.toBeNull();
    expect(parseGridQuery('"body slam"x').error).not.toBeNull();
    expect(parseGridQuery('name:"body slam"x').error).not.toBeNull();
  });

  it("treats a bare or spaced minus as unreadable", () => {
    expect(parseGridQuery("-").error).not.toBeNull();
    expect(parseGridQuery("-\tstrike").error).not.toBeNull();
    expect(parseGridQuery("strike -").error).not.toBeNull();
  });

  it("treats spaced or fieldless operators as unreadable", () => {
    expect(parseGridQuery("lift > 2").error).not.toBeNull();
    expect(parseGridQuery(">50").error).not.toBeNull();
    expect(parseGridQuery(":foo").error).not.toBeNull();
  });

  it("bounds nesting and length instead of exhausting the stack", () => {
    const deep = `${"(".repeat(10_000)}strike${")".repeat(10_000)}`;
    expect(parseGridQuery(deep).error).not.toBeNull();
    expect(parseGridQuery(deep).ast).toBeNull();
    const nested = `${"(".repeat(25)}strike${")".repeat(25)}`;
    expect(parseGridQuery(nested).error).not.toBeNull();
    expect(
      parseGridQuery(`${"(".repeat(5)}strike${")".repeat(5)}`).error,
    ).toBeNull();
  });

  it("accepts plain decimals only", () => {
    expect(parseGridQuery("lift<Infinity").error).not.toBeNull();
    expect(parseGridQuery("picks=0x64").error).not.toBeNull();
    expect(parseGridQuery("win>5e1").error).not.toBeNull();
    expect(matches("win>50,5", row({ winRate: 50.6 }))).toBe(true);
    expect(matches("lift>.5", row({ lift: 2 }))).toBe(true);
  });

  it("matches rarity and group as whole values", () => {
    const uncommon = row({ rarity: "uncommon" });
    expect(matches("rarity:common", uncommon)).toBe(false);
    expect(matches("-rarity:common", uncommon)).toBe(true);
    expect(matches("rarity:uncommon", uncommon)).toBe(true);
    expect(matches("color:red", row())).toBe(true);
    expect(matches("color:re", row())).toBe(false);
  });

  it("supports != on text fields", () => {
    expect(matches("rarity!=common", row())).toBe(false);
    expect(matches("rarity!=rare", row())).toBe(true);
    expect(parseGridQuery("rarity>common").error).not.toBeNull();
  });

  it("treats newlines as spaces", () => {
    expect(matches("strike\nattack", row())).toBe(true);
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

  it("falls back on an unclosed quote", () => {
    expect(parseGridQuery('"body slam').error).not.toBeNull();
  });

  it("returns a null ast for an empty query", () => {
    const parsed = parseGridQuery("   ");
    expect(parsed.ast).toBeNull();
    expect(parsed.error).toBeNull();
  });
});
