import { describe, expect, it } from "vitest";
import { markdownExcerpt } from "./steam-news";

describe("markdownExcerpt", () => {
  it("drops markdown syntax and keeps the words", () => {
    const body =
      "**Spire Codex got a big stats update**\n\nEverything now lives under **spire-codex.com/stats**.\n\n**New tables**\n- **Relics**: Codex Elo\n- [Shops](/stats/shops): what people buy";
    const out = markdownExcerpt(body, 400);
    expect(out).not.toMatch(/\*\*|\]\(|^- /);
    expect(out).toContain("Spire Codex got a big stats update");
    expect(out).toContain("Relics: Codex Elo");
    expect(out).toContain("Shops: what people buy");
  });

  it("separates list items that sit on their own lines", () => {
    expect(
      markdownExcerpt(
        "Website:\n\n- Replays in gold\n- More translations",
        200,
      ),
    ).toBe("Website: Replays in gold. More translations");
  });

  it("strips inline code and headings", () => {
    expect(markdownExcerpt("## Website\n\nA new `replays` view", 200)).toBe(
      "Website. A new replays view",
    );
  });
});
