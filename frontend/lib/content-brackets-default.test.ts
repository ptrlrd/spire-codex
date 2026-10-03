import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTENT_BRACKET,
  bracketParam,
  bracketQuery,
  defaultBracket,
} from "@/lib/content-brackets";

describe("default content bracket", () => {
  it("falls back to standard solo runs when the URL carries no bracket", () => {
    expect(defaultBracket(undefined)).toBe(DEFAULT_CONTENT_BRACKET);
    expect(defaultBracket("")).toBe(DEFAULT_CONTENT_BRACKET);
    expect(defaultBracket("all")).toBe("all");
    expect(defaultBracket("solo:wr50")).toBe("solo:wr50");
    expect(defaultBracket(undefined, "solo")).toBe("solo");
  });

  it("writes every bracket but the default into the URL, all included", () => {
    expect(bracketQuery(DEFAULT_CONTENT_BRACKET)).toBeNull();
    expect(bracketQuery("all")).toBe("all");
    expect(bracketQuery("a10")).toBe("a10");
    expect(bracketQuery("solo", "solo")).toBeNull();
  });

  it("sends the default composite to the API as is", () => {
    expect(bracketParam(DEFAULT_CONTENT_BRACKET)).toBe("solo:standard");
    expect(bracketParam("all")).toBeNull();
  });
});
