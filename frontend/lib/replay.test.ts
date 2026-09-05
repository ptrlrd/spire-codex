import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCombatKind, parseReplay, routeForAct } from "./replay";

const JOURNAL = readFileSync(resolve(__dirname, "../../backend/tests/fixtures/real-replay.jsonl"), "utf-8");

describe("parseReplay on the real journal", () => {
  const model = parseReplay(JOURNAL);

  it("splits the run into floors with the act map", () => {
    expect(model.lineCount).toBe(994);
    expect(model.floors).toHaveLength(17);
    expect(model.maps[1].nodes).toHaveLength(56);
    expect(model.maps[1].edges.length).toBeGreaterThan(56);
    expect(model.actNames[1]).toBe("OVERGROWTH");
    expect(model.startingDeck).toHaveLength(13);
    expect(model.finalDeck.map((c) => c.c)).toContain(128);
    expect(model.end?.terminal_reason).toBe("death");
  });

  it("attaches combats with turns and the death on the last floor", () => {
    const combats = model.floors.filter((f) => f.combat);
    expect(combats).toHaveLength(6);
    expect(combats.every((f) => isCombatKind(f.kind))).toBe(true);
    const turns = combats.reduce((n, f) => n + (f.combat?.turns.length ?? 0), 0);
    expect(turns).toBe(76);
    const last = combats[combats.length - 1].combat!;
    expect(last.result).toBe("death");
    expect(last.hpEnd).toBe(0);
    const first = combats[0].combat!;
    expect(first.encounter).toBe("NIBBITS_WEAK");
    expect(first.result).toBe("victory");
    expect(first.turns[0].lines.some((l) => l.t === "play")).toBe(true);
  });

  it("pairs decisions with picks and marks unselectable options", () => {
    const all = model.floors.flatMap((f) => f.decisions);
    expect(all).toHaveLength(16);
    const transform = all.find((d) => d.id === 15)!;
    expect(transform.selectKind).toBe("transform");
    expect(transform.options).toHaveLength(21);
    expect(transform.options.filter((o) => !o.selectable)).toHaveLength(9);
    expect(transform.options.filter((o) => o.chosen).map((o) => o.instanceId)).toEqual([5]);
    const neow = all.find((d) => d.id === 1)!;
    expect(neow.eventId).toBe("NEOW");
    expect(neow.options.find((o) => o.chosen)?.grantsRelic).toBe("SMALL_CAPSULE");
    const rewards = all.filter((d) => d.source === "reward");
    expect(rewards).toHaveLength(5);
    for (const d of rewards) {
      const picked = d.options.filter((o) => o.chosen);
      expect(picked.length).toBe(d.outcome === "skip" ? 0 : 1);
    }
    const shop = model.floors.find((f) => f.kind === "merchant")!;
    expect(shop.lines.some((l) => l.t === "buy")).toBe(true);
  });

  it("places every mapped floor on a row without coords", () => {
    const route = routeForAct(model, 1);
    const mapped = model.floors.filter((f) => f.act === 1 && f.id !== "NEOW" && f.kind !== "combat" || (f.kind === "combat" && !f.id?.includes("BOSS")));
    expect(route.size).toBeGreaterThanOrEqual(mapped.length - 1);
    expect(route.get(2)?.[1]).toBe(1);
    const rows = [...route.values()].map((c) => c[1]);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("carries hp and gold forward per floor", () => {
    const withHp = model.floors.filter((f) => f.hpAfter !== null);
    expect(withHp.length).toBeGreaterThan(5);
    expect(model.floors[model.floors.length - 1].hpAfter).toBe(0);
  });
});

describe("parseReplay on the Regent journal (deck_c, end_turn, exact identity)", () => {
  const model = parseReplay(
    readFileSync(resolve(__dirname, "../../backend/tests/fixtures/real-replay-regent.jsonl"), "utf-8"),
  );

  it("keeps the identity fields the backend matches on", () => {
    expect(model.header.seed).toBe("FHM18MSNRX8V");
    expect(model.header.start_time).toBe(1788649241);
    expect(model.header.build_id).toBe("v0.111.0");
    expect(model.floors).toHaveLength(7);
    expect(model.floors.filter((f) => f.combat)).toHaveLength(5);
  });

  it("keeps end_turn lines inside their turn and deck ids on plays", () => {
    const first = model.floors.find((f) => f.combat)!.combat!;
    expect(first.turns.some((tn) => tn.lines.some((l) => l.t === "end_turn"))).toBe(true);
    const play = first.turns[0].lines.find((l) => l.t === "play")!;
    expect(play.deck_c).toBe(7);
    expect(model.floors[model.floors.length - 1].combat?.result).toBe("death");
  });

  it("places the seven floors on the map", () => {
    const route = routeForAct(model, 1);
    expect(route.size).toBe(6);
  });
});
