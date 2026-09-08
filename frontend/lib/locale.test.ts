import { describe, expect, it } from "vitest";
import { hreflangOf, inLanguageOf, isLocale, langQuery, localeOf, localePath } from "./locale";

describe("locale helpers", () => {
  it("treats English as the unprefixed default", () => {
    expect(localePath("eng", "/cards")).toBe("/cards");
    expect(localePath("eng", "/")).toBe("/");
    expect(langQuery("eng")).toBe("");
    expect(hreflangOf("eng")).toBe("en");
    expect(inLanguageOf("eng")).toBeUndefined();
  });

  it("prefixes every other locale", () => {
    expect(localePath("jpn", "/cards/bash")).toBe("/jpn/cards/bash");
    expect(localePath("jpn", "/")).toBe("/jpn");
    expect(localePath("deu", "relics")).toBe("/deu/relics");
    expect(langQuery("jpn")).toBe("?lang=jpn");
    expect(langQuery("jpn", "&")).toBe("&lang=jpn");
    expect(hreflangOf("zhs")).toBe("zh-Hans");
    expect(inLanguageOf("fra")).toBe("fr");
  });

  it("falls back to English for an unknown segment", () => {
    expect(isLocale("jpn")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(localeOf("xx")).toBe("eng");
    expect(localeOf("kor")).toBe("kor");
  });



});
