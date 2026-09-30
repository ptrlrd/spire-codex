import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sitemap URLs stay valid XML", () => {
  it("never writes a bare ampersand into a sitemap url", () => {
    const source = readFileSync(
      new URL("../app/sitemap.ts", import.meta.url),
      "utf8",
    );
    const bare = source.match(/url: `[^`]*[^&;]&(?!amp;)[^`]*`/g) ?? [];
    expect(bare).toEqual([]);
  });
});
