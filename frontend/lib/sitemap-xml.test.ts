import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

describe("sitemap URLs stay valid XML", () => {
  it("never writes a bare ampersand into a sitemap url", () => {
    const source = readFileSync(
      new URL("../app/sitemap.ts", import.meta.url),
      "utf8",
    );
    const bare = source.match(/url: `[^`]*[^&;]&(?!amp;)[^`]*`/g) ?? [];
    expect(bare).toEqual([]);
  });

  it("escapes the ampersand in every generated tier list variant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/api/mechanics/sections")
          ? [{ slug: "score-formula" }]
          : url.endsWith("/api/changelogs")
            ? [{ date: "2026-08-14" }]
            : [{ id: "ALPHA", name: "Alpha", image_url: null }];
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    try {
      const { default: sitemap } = await import("@/app/sitemap");
      const urls = (await sitemap()).map((e) => e.url);
      expect(urls.some((u) => u.includes("&amp;"))).toBe(true);
      expect(urls.filter((u) => /&(?!amp;)/.test(u))).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
