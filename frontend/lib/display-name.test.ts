import { describe, expect, it } from "vitest";
import { cleanId, displayName } from "./display-name";

describe("displayName", () => {
  it("title-cases an all-caps id", () => {
    expect(displayName("IRONCLAD")).toBe("Ironclad");
    expect(displayName("TOOLS_OF_THE_TRADE")).toBe("Tools Of The Trade");
    expect(displayName("FUZZY_WURM_CRAWLER")).toBe("Fuzzy Wurm Crawler");
    expect(displayName("statuscard")).toBe("Statuscard");
  });

  it("strips a kind prefix first", () => {
    expect(displayName("CARD.STRIKE")).toBe("Strike");
    expect(displayName("CHARACTER.NECROBINDER")).toBe("Necrobinder");
    expect(displayName("POWER.FRAIL_POWER")).toBe("Frail Power");
    expect(cleanId("RELIC.BURNING_BLOOD")).toBe("BURNING_BLOOD");
  });

  it("leaves a name that is not an id untouched", () => {
    expect(displayName("Чистилище душ")).toBe("Чистилище душ");
    expect(displayName("Frog Knight")).toBe("Frog Knight");
    expect(displayName("カエルの騎士")).toBe("カエルの騎士");
  });

  it("handles an empty id", () => {
    expect(displayName("")).toBe("");
    expect(displayName("CHARACTER.")).toBe("");
  });
});
