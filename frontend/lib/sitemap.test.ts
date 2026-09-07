import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TIER_RELIC_ACTS, TIER_RELIC_ANCIENTS } from "./tier-list-filters";

const SITE = "https://sitemap.test";
let sitemap: () => Promise<{ url: string; lastModified?: Date | string }[]>;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.resetModules();
  sitemap = (await import("@/app/sitemap")).default;
});

type Handler = (url: string) => Response | Promise<Response>;

function stubApi(handler: Handler) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => handler(String(input))));
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const entity = (id: string) => ({ id, name: id, image_url: null });

function healthyApi(url: string): Response {
  if (url.endsWith("/api/changelogs")) return ok([{ date: "2026-08-14" }]);
  if (url.endsWith("/api/mechanics/sections")) return ok([{ slug: "score-formula" }]);
  if (url.endsWith("/api/glossary")) return ok([entity("STRENGTH")]);
  if (url.endsWith("/api/keywords")) return ok([entity("STRENGTH"), entity("BLOCK")]);
  if (url.endsWith("/api/guides")) return ok([entity("first-guide")]);
  return ok([entity("ALPHA")]);
}

afterEach(() => vi.unstubAllGlobals());

describe("sitemap", () => {
  it("lists every ancient and act relic tier-list variant exactly once", async () => {
    stubApi(healthyApi);
    const urls = (await sitemap()).map((e) => e.url);
    const expected = new Set<string>([
      ...TIER_RELIC_ACTS.map((a) => `${SITE}/tier-list/relics?act=${a}`),
      ...TIER_RELIC_ANCIENTS.map((a) => `${SITE}/tier-list/relics?ancient=${a}`),
      ...TIER_RELIC_ACTS.flatMap((act) => TIER_RELIC_ANCIENTS.map((a) => `${SITE}/tier-list/relics?act=${act}&ancient=${a}`)),
    ]);
    const variants = urls.filter((u) => u.includes("/tier-list/relics?") && (u.includes("ancient=") || u.includes("act=")));
    expect(new Set(variants)).toEqual(expected);
    expect(variants).toHaveLength(expected.size);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("dates game-data pages by the changelog and leaves hubs and guides undated", async () => {
    stubApi(healthyApi);
    const entries = await sitemap();
    const byUrl = new Map(entries.map((e) => [e.url, e]));
    expect(byUrl.get(`${SITE}/`)?.lastModified).toBeUndefined();
    expect(byUrl.get(`${SITE}/tier-list/relics`)?.lastModified).toBeUndefined();
    expect(byUrl.get(`${SITE}/guides/first-guide`)?.lastModified).toBeUndefined();
    expect(byUrl.get(`${SITE}/fra/guides/first-guide`)?.lastModified).toBeUndefined();
    expect(byUrl.get(`${SITE}/cards/alpha`)?.lastModified).toEqual(new Date("2026-08-14"));
    expect(byUrl.get(`${SITE}/fra/cards/alpha`)?.lastModified).toEqual(new Date("2026-08-14"));
  });

  it("fails the build when a list endpoint errors instead of dropping the section", async () => {
    stubApi((url) => (url.endsWith("/api/monsters") ? new Response("", { status: 429 }) : healthyApi(url)));
    await expect(sitemap()).rejects.toThrow("/api/monsters returned 429");
  });

  it("fails the build when the mechanics inventory errors", async () => {
    stubApi((url) => (url.endsWith("/api/mechanics/sections") ? new Response("", { status: 500 }) : healthyApi(url)));
    await expect(sitemap()).rejects.toThrow("/api/mechanics/sections returned 500");
  });

  it("rejects entity rows without a string id", async () => {
    stubApi((url) => (url.endsWith("/api/relics") ? ok([{ id: 7 }]) : healthyApi(url)));
    await expect(sitemap()).rejects.toThrow("/api/relics returned a malformed list");
  });

  it("keeps keyword ids that appear in both keyword sources to one URL", async () => {
    stubApi(healthyApi);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.filter((u) => u === `${SITE}/keywords/strength`)).toHaveLength(1);
  });
});
