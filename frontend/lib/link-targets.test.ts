import { describe, expect, it } from "vitest";
import {
  actHref,
  characterHref,
  comparePairs,
  poolLabel,
  startHereGuides,
} from "./link-targets";

describe("entity links", () => {
  it("links only the characters that have a page", () => {
    expect(characterHref("IRONCLAD")).toBe("/characters/ironclad");
    expect(characterHref("colorless")).toBeNull();
    expect(characterHref(undefined)).toBeNull();
  });

  it("builds compare slugs in the order the compare pages use", () => {
    expect(comparePairs("DEFECT")).toEqual([
      { other: "ironclad", slug: "ironclad-vs-defect" },
      { other: "silent", slug: "silent-vs-defect" },
      { other: "necrobinder", slug: "defect-vs-necrobinder" },
      { other: "regent", slug: "defect-vs-regent" },
      { other: "fool", slug: "defect-vs-fool" },
    ]);
    expect(characterHref("FOOL")).toBe("/characters/fool");
    expect(comparePairs("watcher")).toEqual([]);
  });

  it("names a relic pool through the translator", () => {
    const t = (key: string) => `[${key}]`;
    expect(poolLabel("ironclad", t)).toBe("[Ironclad]");
    expect(poolLabel("shared", t)).toBe("[Shared]");
    expect(poolLabel("", t)).toBe("");
  });

  it("turns an act label into its page", () => {
    expect(actHref("Act 1 - Overgrowth")).toBe("/acts/overgrowth");
    expect(actHref("Act 3 - Glory")).toBe("/acts/glory");
    expect(actHref("Overgrowth")).toBeNull();
    expect(actHref(null)).toBeNull();
  });

  it("picks the beginner guides that exist, in a fixed order", () => {
    const guides = [
      { slug: "keywords-guide" },
      { slug: "boss-guide" },
      { slug: "getting-started" },
    ];
    expect(startHereGuides(guides).map((g) => g.slug)).toEqual([
      "getting-started",
      "keywords-guide",
    ]);
  });
});
