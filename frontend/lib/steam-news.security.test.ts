import { describe, expect, it } from "vitest";
import { sanitizeSteamNews } from "./steam-news";

describe("news HTML sanitizer", () => {
  it("drops slash-separated event handlers", () => {
    const out = sanitizeSteamNews(
      "<p>hi <img/src=x/onerror=alert(1)> there</p>",
    );
    expect(out).not.toMatch(/<img[^>]*\sonerror/i);
    expect(out).not.toMatch(/\sonerror\s*=/i);
  });

  it("drops entity-encoded javascript links", () => {
    const out = sanitizeSteamNews(
      '<a href="&#106;avascript:alert(1)">x</a> <a href="JaVaScRiPt:alert(2)">y</a>',
    );
    expect(out).not.toMatch(/javascript/i);
    expect(out).not.toMatch(/&#106;/);
    expect(out).toContain("<a>x</a>");
  });

  it("drops svg, style and unknown tags but keeps formatting", () => {
    const out = sanitizeSteamNews(
      '<svg onload=alert(1)></svg><style>*{}</style><b>bold</b> <a href="https://store.steampowered.com/x">link</a>',
    );
    expect(out).not.toMatch(/svg|style|onload/i);
    expect(out).toContain("<b>bold</b>");
    expect(out).toContain('href="https://store.steampowered.com/x"');
  });

  it("only allows https images", () => {
    const out = sanitizeSteamNews(
      '<img src="http://x/y.png"><img src="https://clan.cloudflare.steamstatic.com/images/a.png">',
    );
    expect(out).not.toContain("http://x/y.png");
    expect(out).toContain(
      "https://clan.cloudflare.steamstatic.com/images/a.png",
    );
  });
});
