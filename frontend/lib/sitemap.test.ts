import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";

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
  return ok([entity("ALPHA")]);
}

afterEach(() => vi.unstubAllGlobals());

describe("sitemap", () => {
  it("lists the ancient and act tier-list variants once each", async () => {
    stubApi(healthyApi);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://spire-codex.com/tier-list/relics?ancient=pael");
    expect(urls).toContain("https://spire-codex.com/tier-list/relics?act=3&ancient=vakuu");
    expect(urls).toContain("https://spire-codex.com/tier-list/relics?act=2");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("dates entity pages by the changelog and leaves hub pages undated", async () => {
    stubApi(healthyApi);
    const entries = await sitemap();
    const home = entries.find((e) => e.url === "https://spire-codex.com/")!;
    const card = entries.find((e) => e.url === "https://spire-codex.com/cards/alpha")!;
    const tier = entries.find((e) => e.url === "https://spire-codex.com/tier-list/relics")!;
    expect(home.lastModified).toBeUndefined();
    expect(tier.lastModified).toBeUndefined();
    expect(card.lastModified).toEqual(new Date("2026-08-14"));
  });

  it("fails the build when a list endpoint errors instead of dropping the section", async () => {
    stubApi((url) => (url.endsWith("/api/monsters") ? new Response("", { status: 429 }) : healthyApi(url)));
    await expect(sitemap()).rejects.toThrow("/api/monsters returned 429");
  });

  it("keeps keyword ids that appear in both keyword sources to one URL", async () => {
    stubApi(healthyApi);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.filter((u) => u === "https://spire-codex.com/keywords/strength")).toHaveLength(1);
  });
});
