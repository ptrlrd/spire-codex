import { describe, expect, it } from "vitest";
import { clientMessagesFor, messagesFor } from "./messages";
import SERVER_ONLY_KEYS from "@/lib/i18n-server-only-keys.json";
import { serverOnlyKeys } from "@/scripts/generate-client-i18n.mjs";
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
    const withApostrophe = Object.entries(eng).find(([, value]) =>
      value.includes("'"),
    );
    expect(withApostrophe).toBeDefined();
    expect(withApostrophe?.[1]).not.toMatch(/(^|[^'])'([^']|$)/);
  });

  it("gives every locale the same keys, falling back to English", () => {
    const eng = messagesFor("eng");
    const jpn = messagesFor("jpn");
    expect(Object.keys(jpn).sort()).toEqual(Object.keys(eng).sort());
    expect(jpn[safeKey("Cards")]).not.toBe(eng[safeKey("Cards")]);
  });

  it("ships the browser only strings the fallback can't render", () => {
    const eng = clientMessagesFor("eng");
    expect(eng[safeKey("Cards")]).toBeUndefined();
    for (const [key, text] of Object.entries(eng))
      expect(/[{}<]/.test(text) || text !== unsafeKey(key)).toBe(true);
    const jpn = clientMessagesFor("jpn");
    expect(jpn[safeKey("Cards")]).toBe(messagesFor("jpn")[safeKey("Cards")]);
    for (const key of SERVER_ONLY_KEYS)
      expect(jpn[safeKey(key)]).toBeUndefined();
  });

  it("keeps the server-only list in step with the source", async () => {
    expect(await serverOnlyKeys()).toEqual(SERVER_ONLY_KEYS);
  }, 30_000);
});
