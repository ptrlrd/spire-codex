import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  draftFromStorage,
  draftToStorage,
  formatDeck,
  hasDraft,
  isEmptyDraft,
  paramsFromState,
  parseDeck,
  stateFromParams,
  takePercent,
} from "./deck-builder-state";

describe("deck builder URL state", () => {
  it("round-trips a draft with duplicate cards, relics, an offer and a target", () => {
    const state = {
      character: "IRONCLAD",
      deck: ["BASH", "BASH", "ANGER"],
      relics: ["AKABEKO", "ANCHOR"],
      offer: ["WHIRLWIND", "FLEX"],
      target: "WHIRLWIND+FLEX",
    };
    const qs = paramsFromState(state).toString();
    expect(qs).toBe(
      "character=IRONCLAD&deck=BASH%3A2%2CANGER&relics=AKABEKO%2CANCHOR&offer=WHIRLWIND%2CFLEX&target=WHIRLWIND%2BFLEX",
    );
    expect(stateFromParams(new URLSearchParams(qs))).toEqual(state);
  });

  it("leaves the default character and empty lists out of the query", () => {
    expect(paramsFromState(EMPTY_DRAFT).toString()).toBe("");
    expect(stateFromParams(new URLSearchParams(""))).toEqual(EMPTY_DRAFT);
  });

  it("drops junk, unknown characters, oversize offers and duplicate relics", () => {
    const state = stateFromParams(
      new URLSearchParams(
        "character=WIZARD&deck=bash:0,,an ger:x&relics=A,A,b&offer=1,2,3,4,5,6&target=a+b;drop",
      ),
    );
    expect(state.character).toBe("SILENT");
    expect(state.deck).toEqual(["BASH", "ANGER"]);
    expect(state.relics).toEqual(["A", "B"]);
    expect(state.offer).toEqual(["1", "2", "3", "4", "5"]);
    expect(state.target).toBe("A+BDROP");
  });

  it("formats and parses copies", () => {
    expect(formatDeck(["A", "B", "A", "A"])).toBe("A:3,B");
    expect(parseDeck("A:3,B")).toEqual(["A", "A", "A", "B"]);
    expect(parseDeck("A:40")).toHaveLength(9);
  });

  it("knows when a draft is worth keeping", () => {
    expect(hasDraft(EMPTY_DRAFT)).toBe(false);
    expect(hasDraft({ ...EMPTY_DRAFT, relics: ["ANCHOR"] })).toBe(true);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, offer: ["BASH"] })).toBe(false);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, character: "DEFECT" })).toBe(true);
  });

  it("survives a localStorage round trip and rejects garbage", () => {
    const state = {
      character: "DEFECT",
      deck: ["ZAP", "ZAP"],
      relics: ["CRACKED_CORE"],
      offer: ["GLACIER"],
      target: null,
    };
    expect(draftFromStorage(draftToStorage(state))).toEqual(state);
    expect(draftFromStorage("not json")).toBeNull();
    expect(draftFromStorage("[]")).toBeNull();
    expect(
      draftFromStorage(JSON.stringify({ character: "SILENT" })),
    ).toBeNull();
    expect(draftFromStorage(null)).toBeNull();
  });

  it("turns a take score into a bounded percent", () => {
    expect(takePercent(0.437)).toBe(44);
    expect(takePercent(1.4)).toBe(100);
    expect(takePercent(-0.2)).toBe(0);
    expect(takePercent(null)).toBeNull();
    expect(takePercent(Number.NaN)).toBeNull();
  });
});
