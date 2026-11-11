import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SUPPORTED_LANGS } from "./languages";
import { localizedPath } from "./seo";
import {
  TIER_CARD_COLORS,
  TIER_RELIC_ACTS,
  TIER_RELIC_ANCIENTS,
  TIER_RELIC_POOLS,
  cardTierListCanonical,
  relicTierListCanonical,
  tierListVariantPaths,
} from "./tier-list-filters";

function disallowed(): RegExp[] {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  return list
    .flatMap((r) => r.disallow ?? [])
    .map(
      (pattern) =>
        new RegExp(
          "^" +
            pattern
              .split("*")
              .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
              .join(".*"),
        ),
    );
}

const DISALLOWED = disallowed();
const blocked = (pathAndQuery: string) =>
  DISALLOWED.some((re) => re.test(pathAndQuery));

const LOCALES = ["eng", ...SUPPORTED_LANGS] as const;
const withJunk = <T extends string>(list: readonly T[]) => [
  undefined,
  "",
  "nonsense",
  "x&bracket=a10",
  ...list,
  ...list.map((v) => v.toUpperCase()),
];

afterEach(() => vi.unstubAllGlobals());

describe("tier list canonicals", () => {
  it("knows what the robots rules block", () => {
    expect(blocked("/tier-list/relics?bracket=all")).toBe(true);
    expect(blocked("/fra/tier-list/cards?color=silent&sort=elo")).toBe(true);
    expect(blocked("/tier-list/relics?pool=silent")).toBe(false);
  });

  it("never builds a relic canonical that robots.txt blocks, in any locale", () => {
    const sitemapSet = new Set([
      "/tier-list/relics",
      ...tierListVariantPaths().map((v) => v.path),
    ]);
    for (const pool of withJunk(TIER_RELIC_POOLS))
      for (const act of withJunk(TIER_RELIC_ACTS))
        for (const ancient of withJunk(TIER_RELIC_ANCIENTS)) {
          const path = relicTierListCanonical({ pool, act, ancient });
          expect(sitemapSet.has(path), path).toBe(true);
          for (const locale of LOCALES)
            expect(blocked(localizedPath(locale, path)), path).toBe(false);
        }
  });

  it("drops the character pool once an ancient or an act picks the view", () => {
    expect(relicTierListCanonical({ pool: "silent" })).toBe(
      "/tier-list/relics?pool=silent",
    );
    expect(relicTierListCanonical({ pool: "silent", ancient: "neow" })).toBe(
      "/tier-list/relics?ancient=neow",
    );
    expect(
      relicTierListCanonical({ pool: "silent", act: "2", ancient: "NEOW" }),
    ).toBe("/tier-list/relics?act=2&ancient=neow");
    expect(relicTierListCanonical({ pool: "silent", act: "2" })).toBe(
      "/tier-list/relics?act=2",
    );
    expect(relicTierListCanonical({})).toBe("/tier-list/relics");
  });

  it("never builds a card canonical that robots.txt blocks", () => {
    for (const color of withJunk(TIER_CARD_COLORS)) {
      const path = cardTierListCanonical(color);
      for (const locale of LOCALES)
        expect(blocked(localizedPath(locale, path)), path).toBe(false);
    }
    expect(cardTierListCanonical("Silent")).toBe(
      "/tier-list/cards?color=silent",
    );
    expect(cardTierListCanonical("nonsense")).toBe("/tier-list/cards");
  });

  it("keeps every sitemap URL clear of the robots rules", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/api/mechanics/sections")
          ? [{ slug: "score-formula" }]
          : url.endsWith("/api/changelogs")
            ? [{ date: "2026-08-14" }]
            : url.endsWith("/api/runs/pulse")
              ? { data_through: "2026-11-10 18:27:31.631000" }
              : [{ id: "ALPHA", name: "Alpha", image_url: null }];
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(100);
    const hit = entries
      .map((e) => {
        const u = new URL(e.url.replace(/&amp;/g, "&"));
        return u.pathname + u.search;
      })
      .filter(blocked);
    expect(hit).toEqual([]);
  });
});
