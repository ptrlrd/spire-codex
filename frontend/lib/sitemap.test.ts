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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
  );
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
const entity = (id: string) => ({ id, name: id, image_url: null });

function healthyApi(url: string): Response {
  if (url.endsWith("/api/changelogs"))
    return ok([{ tag: "1.3.1", date: "2026-08-14" }]);
  if (url.endsWith("/api/changelogs?channel=beta"))
    return ok([{ tag: "0.111.0", date: "2026-08-13" }]);
  if (url.endsWith("/api/mechanics/sections"))
    return ok([{ slug: "score-formula" }]);
  if (url.endsWith("/api/glossary")) return ok([entity("STRENGTH")]);
  if (url.endsWith("/api/keywords"))
    return ok([entity("STRENGTH"), entity("BLOCK")]);
  if (url.endsWith("/api/guides")) return ok([entity("first-guide")]);
  return ok([entity("ALPHA")]);
}

afterEach(() => vi.unstubAllGlobals());

describe("sitemap", () => {
  it("skips the network during next build and still lists the static and localized hubs", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const urls = (await sitemap()).map((e) => e.url);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(urls).toContain(`${SITE}/cards`);
      expect(urls).toContain(`${SITE}/jpn/cards`);
    } finally {
      vi.stubEnv("NEXT_PHASE", "");
    }
  });

  it("lists every ancient and act relic tier-list variant exactly once", async () => {
    stubApi(healthyApi);
    const urls = (await sitemap()).map((e) => e.url);
    const expected = new Set<string>([
      ...TIER_RELIC_ACTS.map((a) => `${SITE}/tier-list/relics?act=${a}`),
      ...TIER_RELIC_ANCIENTS.map(
        (a) => `${SITE}/tier-list/relics?ancient=${a}`,
      ),
      ...TIER_RELIC_ACTS.flatMap((act) =>
        TIER_RELIC_ANCIENTS.map(
          (a) => `${SITE}/tier-list/relics?act=${act}&amp;ancient=${a}`,
        ),
      ),
    ]);
    const variants = urls.filter(
      (u) =>
        u.includes("/tier-list/relics?") &&
        (u.includes("ancient=") || u.includes("act=")),
    );
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
    expect(
      byUrl.get(`${SITE}/guides/first-guide`)?.lastModified,
    ).toBeUndefined();
    expect(byUrl.get(`${SITE}/cards/alpha`)?.lastModified).toEqual(
      new Date("2026-08-14"),
    );
    expect(byUrl.get(`${SITE}/fra/cards/alpha`)?.lastModified).toEqual(
      new Date("2026-08-14"),
    );
  });

  it("dates tier list variants by the stats cursor, and leaves them undated without one", async () => {
    stubApi((url) =>
      url.endsWith("/api/runs/pulse")
        ? ok({ data_through: "2026-11-10 18:27:31.631000" })
        : healthyApi(url),
    );
    let byUrl = new Map((await sitemap()).map((e) => [e.url, e]));
    const cursor = new Date("2026-11-10T18:27:31.631Z");
    expect(
      byUrl.get(`${SITE}/tier-list/relics?ancient=neow`)?.lastModified,
    ).toEqual(cursor);
    expect(
      byUrl.get(`${SITE}/tier-list/cards?color=silent`)?.lastModified,
    ).toEqual(cursor);
    expect(
      byUrl.get(`${SITE}/tier-list/relics?act=1&amp;ancient=neow`)
        ?.lastModified,
    ).toEqual(cursor);

    stubApi((url) =>
      url.endsWith("/api/runs/pulse")
        ? new Response("", { status: 503 })
        : healthyApi(url),
    );
    byUrl = new Map((await sitemap()).map((e) => [e.url, e]));
    expect(byUrl.has(`${SITE}/tier-list/relics?ancient=neow`)).toBe(true);
    expect(
      byUrl.get(`${SITE}/tier-list/relics?ancient=neow`)?.lastModified,
    ).toBeUndefined();
  });

  it("lists the tool pages that only had localized entries", async () => {
    stubApi(healthyApi);
    const urls = new Set((await sitemap()).map((e) => e.url));
    for (const path of ["/seed-finder", "/deck-builder", "/tier-list-maker"])
      expect(urls.has(`${SITE}${path}`), path).toBe(true);
  });

  it("leaves out the noindex localized copies of guides and mechanics", async () => {
    stubApi(healthyApi);
    const urls = new Set((await sitemap()).map((e) => e.url));
    expect(urls.has(`${SITE}/guides/first-guide`)).toBe(true);
    expect(urls.has(`${SITE}/mechanics/score-formula`)).toBe(true);
    expect(urls.has(`${SITE}/fra/guides/first-guide`)).toBe(false);
    expect(urls.has(`${SITE}/fra/mechanics/score-formula`)).toBe(false);
    expect(urls.has(`${SITE}/fra/cards/alpha`)).toBe(true);
  });

  it("fails the build when a list endpoint errors instead of dropping the section", async () => {
    stubApi((url) =>
      url.endsWith("/api/monsters")
        ? new Response("", { status: 429 })
        : healthyApi(url),
    );
    await expect(sitemap()).rejects.toThrow("/api/monsters returned 429");
  });

  it("fails the build when the mechanics inventory errors", async () => {
    stubApi((url) =>
      url.endsWith("/api/mechanics/sections")
        ? new Response("", { status: 500 })
        : healthyApi(url),
    );
    await expect(sitemap()).rejects.toThrow(
      "/api/mechanics/sections returned 500",
    );
  });

  it("rejects entity rows without a string id", async () => {
    stubApi((url) =>
      url.endsWith("/api/relics") ? ok([{ id: 7 }]) : healthyApi(url),
    );
    await expect(sitemap()).rejects.toThrow(
      "/api/relics returned a malformed list",
    );
  });

  it("lists game patch pages in every locale and site releases in English only", async () => {
    stubApi(healthyApi);
    const byUrl = new Map((await sitemap()).map((e) => [e.url, e]));
    expect(byUrl.get(`${SITE}/changelog/0.111.0`)?.lastModified).toEqual(
      new Date("2026-08-13"),
    );
    expect(byUrl.has(`${SITE}/jpn/changelog/0.111.0`)).toBe(true);
    expect(byUrl.has(`${SITE}/changelog/1.3.1`)).toBe(true);
    expect(byUrl.has(`${SITE}/jpn/changelog/1.3.1`)).toBe(false);
  });

  it("fails the build when the game patch list errors", async () => {
    stubApi((url) =>
      url.endsWith("/api/changelogs?channel=beta")
        ? new Response("", { status: 502 })
        : healthyApi(url),
    );
    await expect(sitemap()).rejects.toThrow(
      "/api/changelogs?channel=beta returned 502",
    );
  });

  it("keeps keyword ids that appear in both keyword sources to one URL", async () => {
    stubApi(healthyApi);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.filter((u) => u === `${SITE}/keywords/strength`)).toHaveLength(
      1,
    );
  });
});
