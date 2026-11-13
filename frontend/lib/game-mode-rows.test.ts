import { describe, expect, it } from "vitest";
import {
  betaOnlyModeIds,
  modeAnchor,
  type GameModeRow,
} from "./game-mode-rows";

const row = (id: string, epoch: string | null): GameModeRow => ({
  id,
  name: id,
  epoch_id: epoch,
});

describe("game mode rows", () => {
  it("marks the modes a beta epoch unlocks while main has no entry for them", () => {
    const beta = [
      row("STANDARD", null),
      row("DAILY", null),
      row("DREAD", "DREAD_EPOCH"),
      row("BLITZ", "BLITZ_EPOCH"),
    ];
    expect(betaOnlyModeIds([], beta)).toEqual(["DREAD", "BLITZ"]);
    expect(betaOnlyModeIds([row("DREAD", "DREAD_EPOCH")], beta)).toEqual([
      "BLITZ",
    ]);
  });

  it("builds a page anchor from a mode id", () => {
    expect(modeAnchor("DREAD")).toBe("dread");
    expect(modeAnchor("SOME_MODE")).toBe("some-mode");
  });
});
