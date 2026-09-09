import { describe, expect, it } from "vitest";
import { isValidBracket } from "@/app/[locale]/leaderboards/metrics/metrics-data";

describe("metrics bracket validation", () => {
  it("accepts the keys the page offers", () => {
    for (const k of ["all", "solo", "a10", "wr30", "solo:wr30", "4p:a10", "v0.111.0", "solo:a10:v0.111.0"]) {
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
});
