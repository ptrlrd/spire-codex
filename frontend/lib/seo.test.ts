import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { safeKey } from "@/lib/i18n-keys";
import { buildPageMetadata, pageHeading, pageTitle } from "./seo";

describe("page titles", () => {
  it("keeps replacement metacharacters in English segments", () => {
    const segment = "Player $& $$ $' $`";
    expect(pageTitle("eng", segment)).toBe(`${segment} - Slay the Spire 2 (sts2) | Spire Codex`);
  });
  it("uses the locale's game name and native language name elsewhere", () => {
    expect(pageTitle("jpn", "レリック")).toMatch(/^スレイ・ザ・スパイア2 \(STS2\) レリック \| Spire Codex \(日本語\)$/);
    expect(pageHeading("eng", "Relics")).toBe("Slay the Spire 2 (sts2) Relics");
  });
});

describe("buildPageMetadata", () => {
  it("gives a localized page its own canonical and the full hreflang set", () => {
    const meta = buildPageMetadata({ locale: "jpn", path: "/cards", title: "T", description: "D" });
    expect(meta.alternates?.canonical).toBe("/jpn/cards");
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(languages.ja).toMatch(/\/jpn\/cards$/);
    expect(languages["x-default"]).toMatch(/\/cards$/);
    expect(meta.openGraph).toMatchObject({ locale: "ja_JP" });
    expect(meta.robots).toBeUndefined();
  });
  it("cannot opt localized English-only content back into the index", () => {
    const meta = buildPageMetadata({ locale: "jpn", path: "/guides/x", title: "T", supressLanguageAlternates: true, noIndex: false });
    expect(meta.alternates?.canonical).toBe("/guides/x");
    expect(meta.alternates?.languages).toBeUndefined();
    expect(meta.robots).toMatchObject({ index: false });
  });
  it("keeps the English copy of English-only content indexable", () => {
    const meta = buildPageMetadata({ locale: "eng", path: "/guides/x", title: "T", supressLanguageAlternates: true });
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.languages).toBeUndefined();
  });
  it("does not advertise hreflang for hidden pages or pages whose canonical lives elsewhere", () => {
    expect(buildPageMetadata({ locale: "eng", path: "/x", title: "T", noIndex: true }).alternates?.languages).toBeUndefined();
    const steam = buildPageMetadata({ locale: "eng", path: "/news/1", title: "T", canonical: "https://store.steampowered.com/news/app/2868840/view/1" });
    expect(steam.alternates?.canonical).toBe("https://store.steampowered.com/news/app/2868840/view/1");
    expect(steam.alternates?.languages).toBeUndefined();
    expect(steam.openGraph).toMatchObject({ url: "https://store.steampowered.com/news/app/2868840/view/1" });
    expect(buildPageMetadata({ locale: "eng", path: "/x", title: "T", hreflang: false }).alternates?.languages).toBeUndefined();
  });
});

describe("entity meta descriptions", () => {
  const t = createTranslator({ locale: "en", messages: messagesFor("eng"), onError: (e) => { throw e; } });
  it("keeps a description whose text is exactly none", () => {
    expect(t(safeKey("relic_meta_description"), { name: "Anchor", rarity: "Common", desc: "none", hasDesc: "yes" })).toMatch(/: none$/);
  });
  it("ends with a period when there is no description", () => {
    expect(t(safeKey("relic_meta_description"), { name: "Anchor", rarity: "Common", desc: "", hasDesc: "no" })).toMatch(/\(sts2\)\.$/);
  });
});
