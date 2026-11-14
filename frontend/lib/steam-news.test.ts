import { describe, expect, it } from "vitest";
import { sanitizeSteamNews } from "./steam-news";

describe("Steam posts written with paragraph tags", () => {
  const post =
    "[p]Hi folks,[/p][p][/p][p]A small update.[/p][h2][b]ART:[/b][/h2]" +
    "[list][*][p]Added icons:[/p][list][*][p][b]Explosive[/b][/p][/*][/list][/*]" +
    "[*][p]Arrows stick to the body[/p][/*][/list]";

  it("keeps paragraphs apart and leaves no raw tags", () => {
    const html = sanitizeSteamNews(post);
    expect(html).toContain("<p>Hi folks,</p>");
    expect(html).toContain("<p>A small update.</p>");
    expect(html).not.toMatch(/\[\/?[a-z*]+\]/i);
  });

  it("nests the sub list inside its item", () => {
    const html = sanitizeSteamNews(post).replaceAll(/\s+/g, " ");
    expect(html).toMatch(
      /<li>\s*Added icons:\s*<ul>\s*<li>\s*<strong>Explosive<\/strong>\s*<\/li>\s*<\/ul>\s*<\/li>/,
    );
    expect(html).toMatch(/<li>\s*Arrows stick to the body\s*<\/li>/);
  });
});
