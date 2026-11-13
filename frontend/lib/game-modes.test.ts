import { describe, expect, it } from "vitest";
import {
  GAME_MODES,
  GAME_MODE_IDS,
  GAME_MODE_WORDS,
  gameModeLabel,
  isGameMode,
} from "./game-modes";
import { MODE_BRACKETS, splitBracket } from "./content-brackets";

describe("game modes", () => {
  it("lists the modes the backend accepts", () => {
    expect(GAME_MODE_IDS).toEqual([
      "standard",
      "daily",
      "custom",
      "blitz",
      "dread",
    ]);
  });

  it("recognizes a mode and rejects anything else", () => {
    expect(isGameMode("blitz")).toBe(true);
    expect(isGameMode("dread")).toBe(true);
    expect(isGameMode("daily_today")).toBe(false);
    expect(isGameMode("")).toBe(false);
    expect(isGameMode(null)).toBe(false);
  });

  it("labels a run's mode, standard when it has none", () => {
    expect(gameModeLabel("BLITZ")).toBe("Blitz");
    expect(gameModeLabel(undefined)).toBe("Standard");
    expect(gameModeLabel("endless")).toBe("");
  });

  it("gives every mode a phrase for cohort labels", () => {
    for (const mode of GAME_MODES)
      expect(GAME_MODE_WORDS[mode.id]).toBeTruthy();
  });

  it("feeds the stats mode brackets", () => {
    expect(MODE_BRACKETS.map((b) => b.key)).toEqual(GAME_MODE_IDS);
    expect(splitBracket("blitz:solo").mode).toBe("blitz");
    expect(splitBracket("dread:v0.113.0")).toMatchObject({
      mode: "dread",
      version: "v0.113.0",
    });
  });
});
