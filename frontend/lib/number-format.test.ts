import { describe, expect, it } from "vitest";
import { formatNumber, numberFormatter, numberLocale } from "./number-format";
import { formatNewsDate } from "./steam-news";
import { SUPPORTED_LANGS } from "./languages";

describe("number formatting", () => {
  it("groups by the route locale, never the runtime default", () => {
    expect(formatNumber(2694159, "eng")).toBe("2,694,159");
    expect(formatNumber(2694159, "deu")).toBe("2.694.159");
    expect(formatNumber(2694159, "jpn")).toBe("2,694,159");
    expect(formatNumber(2694159, "ptb")).toBe("2.694.159");
    expect(numberFormatter("deu")(1234.5)).toBe("1.234,5");
  });

  it("has a tag for every route locale", () => {
    expect(numberLocale("eng")).toBe("en-US");
    expect(numberLocale("nope")).toBe("en-US");
    for (const lang of SUPPORTED_LANGS)
      expect(() => formatNumber(1000, lang)).not.toThrow();
  });
});

describe("formatNewsDate", () => {
  it("writes the date in the route locale, on the Pacific calendar", () => {
    const ts = Date.UTC(2026, 2, 6, 3, 0, 0) / 1000;
    expect(formatNewsDate(ts)).toBe("March 5, 2026");
    expect(formatNewsDate(ts, "deu")).toBe("5. März 2026");
    expect(formatNewsDate(ts, "jpn")).toBe("2026年3月5日");
  });
});
