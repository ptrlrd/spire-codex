import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRACKET,
  isValidBracket,
  parseBracket,
} from "@/app/[locale]/stats/_grid/bracket";
import { parseGridView, writeGridView } from "@/app/[locale]/stats/_grid/prefs";
describe("metrics bracket validation", () => {
  it("accepts the keys the page offers", () => {
    for (const k of [
      "all",
      "solo",
      "a10",
      "wr30",
      "solo:wr30",
      "4p:a10",
      "v0.111.0",
      "solo:a10:v0.111.0",
    ]) {
      expect(isValidBracket(k)).toBe(true);
    }
  });

  it("rejects a second skill tier or trailing junk, which the API would quietly serve as all runs", () => {
    // The old check only looked at the first two parts, so "solo:a10:wr30"
    // passed, the API fell back to every run, and the page labelled that as
    // solo A10 over 30% win rate.
    expect(isValidBracket("solo:a10:wr30")).toBe(false);
    expect(isValidBracket("solo:a10:garbage")).toBe(false);
    expect(isValidBracket("bogus:bracket")).toBe(false);
  });

  it("defaults a grid without ?bracket to standard solo runs", () => {
    expect(DEFAULT_BRACKET).toBe("solo:standard");
    expect(isValidBracket(DEFAULT_BRACKET)).toBe(true);
    expect(parseBracket(DEFAULT_BRACKET)).toEqual({
      player: "solo",
      skill: "",
      mode: "standard",
      version: "",
    });
  });
});

describe("grid view url params", () => {
  const cols = ["name", "elo", "n", "winRate"] as const;

  it("reads valid params and ignores junk", () => {
    expect(
      parseGridView(
        { sort: "elo", dir: "asc", samples: "1", wax: "1", upg: "1" },
        cols,
      ),
    ).toEqual({ sort: "elo", dir: 1, samples: true, wax: true, upg: true });
    expect(parseGridView({ sort: "hack", dir: "sideways" }, cols)).toEqual({});
    expect(parseGridView({ dir: "desc", samples: "0" }, cols)).toEqual({
      dir: -1,
    });
  });

  it("writes params omitting defaults", () => {
    const p = new URLSearchParams();
    writeGridView(p, { sort: "elo", dir: -1 });
    expect(p.toString()).toBe("sort=elo");
    const q = new URLSearchParams();
    writeGridView(q, { dir: 1, samples: true });
    expect(q.toString()).toBe("dir=asc&samples=1");
  });
});
