import { describe, expect, it } from "vitest";
import { messagesFor } from "./messages";
import { safeKey, unsafeKey } from "@/lib/i18n-keys";

describe("message catalogs", () => {
  it("keeps English text as the key, with periods made safe for next-intl", () => {
    expect(safeKey("Loading replay.")).toBe("Loading replay․");
    expect(unsafeKey(safeKey("a.b.c"))).toBe("a.b.c");
    const eng = messagesFor("eng");
    for (const key of Object.keys(eng)) expect(key).not.toContain(".");
  });

  it("escapes apostrophes for ICU so they render literally", () => {
    const eng = messagesFor("eng");
    const withApostrophe = Object.entries(eng).find(([, value]) => value.includes("'"));
    expect(withApostrophe).toBeDefined();
    expect(withApostrophe?.[1]).not.toMatch(/(^|[^'])'([^']|$)/);
  });

  it("gives every locale the same keys, falling back to English", () => {
    const eng = messagesFor("eng");
    const jpn = messagesFor("jpn");
    expect(Object.keys(jpn).sort()).toEqual(Object.keys(eng).sort());
    expect(jpn[safeKey("Cards")]).not.toBe(eng[safeKey("Cards")]);
  });
});
