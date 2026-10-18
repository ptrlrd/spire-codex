import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScene } from "./replay-scene";

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../backend/tests/fixtures/${name}`, import.meta.url),
    "utf8",
  );

const V7 = fixture("v7-scene.jsonl");
const LINES = V7.split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("buildScene on a version 7 journal", () => {
  const { steps } = buildScene(V7);
  const fight = steps.filter((s) => s.floor === 2);

  it("deals the opening hand from the recorded draws", () => {
    const turn1 = fight.find((s) => s.caption.k === "turn");
    expect(turn1?.p.hand).toEqual([
      "STRIKE_SILENT",
      "DEFEND_SILENT",
      "STRIKE_SILENT",
      "SURVIVOR",
      "NEUTRALIZE",
      "STRIKE_SILENT",
      "STRIKE_SILENT",
    ]);
    expect(turn1?.p.draw_count).toBe(6);
    expect(turn1?.p.energy).toBe(3);
  });

  it("spends energy, moves played cards and tracks block from block.left", () => {
    const survivor = fight.find(
      (s) => s.caption.k === "play" && s.caption.id === "SURVIVOR",
    );
    expect(survivor?.p.energy).toBe(2);
    expect(survivor?.p.block).toBe(8);
    expect(survivor?.p.hand).not.toContain("SURVIVOR");
    expect(survivor?.p.hand).not.toContain("DEFEND_SILENT");
    expect(survivor?.p.discard_count).toBe(3);
  });

  it("applies hit damage and power amounts to the right enemy", () => {
    const neutralize = fight.find(
      (s) => s.caption.k === "play" && s.caption.id === "NEUTRALIZE",
    );
    expect(neutralize?.p.enemies?.[0]).toMatchObject({
      id: "SLUDGE_SPINNER",
      hp: 38,
      max_hp: 41,
      powers: [{ id: "WEAK_POWER", amount: 1 }],
    });
    expect(neutralize?.p.enemies?.[0].intents).toEqual([
      { type: "attack", dmg: 9, hits: 1 },
      { type: "debuff" },
    ]);
  });

  it("discards the hand on the end-turn step, not the last play", () => {
    const end = fight.find((s) => s.caption.k === "end_turn");
    const before = fight[fight.indexOf(end!) - 1];
    expect(before.p.hand?.length).toBe(2);
    expect(end?.p.hand).toEqual([]);
  });

  it("leaves no living enemy when a fight ends", () => {
    for (const s of steps.filter((x) => x.caption.k === "combat_end"))
      expect(s.p.enemies?.filter((e) => (e.hp ?? 1) > 0)).toEqual([]);
  });

  it("loses exactly the HP the recorder totalled for each fight", () => {
    const ends = LINES.filter((l) => l.t === "combat_end");
    for (const end of ends) {
      const floor = end.floor as number;
      const start = steps.find(
        (s) => s.floor === floor && s.caption.k === "combat_start",
      );
      const done = steps.find(
        (s) => s.floor === floor && s.caption.k === "combat_end",
      );
      const healed = LINES.some(
        (l) =>
          l.t === "hp" &&
          l.floor === floor &&
          (l.s as number) > (start?.s ?? 0) &&
          (l.s as number) < (done?.s ?? 0),
      );
      if (healed) continue;
      expect((start?.p.hp ?? 0) - (done?.p.hp ?? 0)).toBe(end.hp_lost_total);
    }
  });

  it("keeps the merchant stock written just before the room line", () => {
    const shop = steps.find((s) => s.floor === 8 && s.caption.k === "room");
    expect(shop?.p.screen).toBe("merchant");
    expect(shop?.p.shop?.cards?.length).toBeGreaterThan(0);
  });

  it("keeps the event on screen and marks the chosen option", () => {
    const chose = steps.find((s) => s.floor === 3 && s.caption.k === "outcome");
    expect(chose?.p.event?.id).toBe("DOORS_OF_LIGHT_AND_DARK");
    expect(chose?.p.event?.options?.map((o) => !!o.chosen)).toEqual([
      true,
      false,
    ]);
    const after = steps.filter((s) => s.floor === 3).pop();
    expect(after?.p.event?.options?.[0].chosen).toBe(true);
  });

  it("lists created cards apart instead of guessing their pile", () => {
    const created = steps.find((s) => s.created.length > 0);
    expect(created).toBeDefined();
    for (const id of created!.created)
      expect(created!.p.hand ?? []).not.toContain(id);
  });
});

describe("buildScene on an older journal", () => {
  it("shows no hand when the journal never recorded the draw pile", () => {
    const { steps } = buildScene(fixture("v2-full-run.jsonl"));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.p.hand === undefined)).toBe(true);
  });
});
