import { describe, expect, it } from "vitest";
import { subtitleLabels } from "./search-subtitle";

describe("search result subtitles", () => {
  it("capitalises raw lower-case values", () => {
    expect(subtitleLabels("ironclad · Attack · Basic")).toEqual([
      "Ironclad",
      "Attack",
      "Basic",
    ]);
    expect(subtitleLabels("general")).toEqual(["General"]);
    expect(subtitleLabels("Uncommon Relic · shared")).toEqual([
      "Uncommon Relic",
      "Shared",
    ]);
  });

  it("drops repeated parts and leaves other text alone", () => {
    expect(subtitleLabels("quest · Quest · Quest")).toEqual(["Quest"]);
    expect(subtitleLabels("Game Assets (Main v0.107.1)")).toEqual([
      "Game Assets (Main v0.107.1)",
    ]);
  });
});
