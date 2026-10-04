import { describe, expect, it } from "vitest";
import {
  entityNameLinks,
  keywordLinkWords,
  splitRichLinks,
  type EntityNameLink,
} from "./rich-links";

const links = (names: [string, string][]): EntityNameLink[] =>
  names.map(([name, href]) => ({ name, href }));

describe("splitRichLinks", () => {
  it("links a keyword mention and keeps its tooltip", () => {
    const linked = new Set<string>();
    const segments = splitRichLinks("Apply 2 Vulnerable.", {
      words: {
        Vulnerable: {
          tooltip: "Takes extra damage.",
          href: "/keywords/vulnerable",
        },
      },
      linked,
    });
    expect(segments).toEqual([
      { text: "Apply 2 " },
      {
        text: "Vulnerable",
        word: "Vulnerable",
        info: { tooltip: "Takes extra damage.", href: "/keywords/vulnerable" },
      },
      { text: "." },
    ]);
  });

  it("links an entity by its exact localized name, whole words only", () => {
    const linked = new Set<string>();
    const segments = splitRichLinks("Lanterns glow; the Lantern shines.", {
      links: links([["Lantern", "relics/lantern"]]),
      linked,
    });
    expect(segments).toEqual([
      { text: "Lanterns glow; the " },
      { text: "Lantern", link: { name: "Lantern", href: "relics/lantern" } },
      { text: " shines." },
    ]);
  });

  it("skips the page's own entity marked as self", () => {
    const segments = splitRichLinks("Lantern shines.", {
      links: [{ name: "Lantern", href: "relics/lantern", self: true }],
      linked: new Set<string>(),
    });
    expect(segments).toEqual([{ text: "Lantern shines." }]);
  });

  it("never links inside an existing keyword link", () => {
    const linked = new Set<string>();
    const segments = splitRichLinks("Shield of Goo grows.", {
      words: {
        "Shield of Goo": {
          tooltip: "A term.",
          href: "/keywords/shield-of-goo",
        },
      },
      links: links([["Shield", "relics/shield"]]),
      linked,
    });
    expect(segments).toEqual([
      {
        text: "Shield of Goo",
        word: "Shield of Goo",
        info: { tooltip: "A term.", href: "/keywords/shield-of-goo" },
      },
      { text: " grows." },
    ]);
  });

  it("prefers the longest name at the same position", () => {
    const linked = new Set<string>();
    const segments = splitRichLinks("Minion Strike hits.", {
      links: links([
        ["Strike", "cards/strike"],
        ["Minion Strike", "cards/minion_strike"],
      ]),
      linked,
    });
    expect(segments).toEqual([
      {
        text: "Minion Strike",
        link: { name: "Minion Strike", href: "cards/minion_strike" },
      },
      { text: " hits." },
    ]);
  });

  it("links each distinct entity at most once per description", () => {
    const linked = new Set<string>();
    const segments = splitRichLinks("Strike, then Strike again.", {
      links: links([["Strike", "cards/strike"]]),
      linked,
    });
    expect(segments.filter((s) => s.link)).toHaveLength(1);
    expect(linked.has("cards/strike")).toBe(true);
  });

  it("matches the localized catalog name, not just the English one", () => {
    const segments = splitRichLinks("La Lanterne brille.", {
      links: links([["Lanterne", "relics/lantern"]]),
      linked: new Set<string>(),
    });
    expect(segments.some((s) => s.link?.name === "Lanterne")).toBe(true);
  });

  it("builds tooltip words from a keyword catalog", () => {
    const words = keywordLinkWords(
      [
        {
          id: "EXHAUST",
          name: "Exhaust",
          description: "Removed until the end of combat.",
        },
      ],
      "/beta",
    );
    expect(words.Exhaust).toEqual({
      tooltip: "Removed until the end of combat.",
      href: "/beta/keywords/exhaust",
    });
  });

  it("builds name links and drops the excluded entity", () => {
    const entries = [
      { id: "STRIKE", name: "Strike" },
      { id: "BASH", name: "Bash" },
    ];
    expect(entityNameLinks(entries, "cards", "BASH")).toEqual([
      { name: "Strike", href: "cards/strike" },
    ]);
  });
});
