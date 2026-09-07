import { describe, expect, it } from "vitest";
import {
  englishOnlyMetadata,
  entityTitle,
  hreflangOf,
  inLanguageOf,
  isLocale,
  langQuery,
  listMetadata,
  localeOf,
  localePath,
} from "./locale";

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

  it("builds localized entity titles with the native language name", () => {
    expect(entityTitle("eng", "Bash", "Card")).toBe("Slay the Spire 2 (sts2) Bash - Card | Spire Codex");
    expect(entityTitle("jpn", "強打", "Card")).toMatch(/^.+ 強打 - カード \| Spire Codex \(日本語\)$/);
  });

  it("points English-only pages at the English canonical and keeps them out of the index", () => {
    expect(englishOnlyMetadata("eng", "/runs")).toEqual({});
    expect(englishOnlyMetadata("jpn", "/runs")).toEqual({
      alternates: { canonical: "/runs" },
      robots: { index: false, follow: true },
    });
  });

  it("gives list pages a canonical on their own locale and hreflang for all", () => {
    const meta = listMetadata("jpn", { path: "/cards", title: "T", description: "D" });
    expect(meta.alternates?.canonical).toBe("/jpn/cards");
    expect(meta.openGraph).toMatchObject({ locale: "ja_JP", url: expect.stringMatching(/\/jpn\/cards$/) });
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(languages["x-default"]).toMatch(/\/cards$/);
    expect(languages.ja).toMatch(/\/jpn\/cards$/);
  });
});
