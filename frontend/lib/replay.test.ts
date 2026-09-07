import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCombatKind, parseReplay, parseReplayLines, routeForAct, type PlayLine } from "./replay";

const JOURNAL = readFileSync(new URL("../../backend/tests/fixtures/real-replay.jsonl", import.meta.url), "utf-8");

function journal(records: Record<string, unknown>[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

describe("parseReplay on the real journal", () => {
  const model = parseReplay(JOURNAL);

  it("splits the run into floors with the act map", () => {
    expect(model.lineCount).toBe(994);
    expect(model.floors).toHaveLength(17);
    expect(model.maps[1].nodes).toHaveLength(58);
    expect(model.maps[1].boss).toBe("VANTOM_BOSS");
    expect(model.maps[1].ancient).toBe("NEOW");
    expect(model.maps[1].edges.length).toBeGreaterThan(56);
    expect(model.actNames[1]).toBe("OVERGROWTH");
    expect(model.startingDeck).toHaveLength(13);
    expect(model.finalDeck.map((c) => c.c)).toContain(128);
    expect(model.end?.terminalReason).toBe("death");
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
    expect(route.size).toBe(17);
    expect(route.get(1)?.[1]).toBe(0);
    expect(route.get(2)?.[1]).toBe(1);
    expect(route.get(17)?.[1]).toBe(16);
    const rows = [...route.values()].map((c) => c[1]);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("carries hp and gold forward per floor", () => {
    const withHp = model.floors.filter((f) => f.hpAfter !== undefined);
    expect(withHp.length).toBeGreaterThan(5);
    expect(model.floors[model.floors.length - 1].hpAfter).toBe(0);
  });
});

describe("parseReplay on the Regent journal (deck_c, end_turn, exact identity)", () => {
  const model = parseReplay(readFileSync(new URL("../../backend/tests/fixtures/real-replay-regent.jsonl", import.meta.url), "utf-8"));

  it("keeps the identity fields the backend matches on", () => {
    expect(model.header?.seed).toBe("FHM18MSNRX8V");
    expect(model.header?.startTime).toBe(1788649241);
    expect(model.header?.buildId).toBe("v0.111.0");
    expect(model.floors).toHaveLength(7);
    expect(model.floors.filter((f) => f.combat)).toHaveLength(5);
  });

  it("keeps end_turn lines inside their turn and deck ids on plays", () => {
    const first = model.floors.find((f) => f.combat)!.combat!;
    expect(first.turns.some((tn) => tn.lines.some((l) => l.t === "end_turn"))).toBe(true);
    const play = first.turns[0].lines.find((l): l is PlayLine => l.t === "play")!;
    expect(play.deckC).toBe(7);
    expect(model.floors[model.floors.length - 1].combat?.result).toBe("death");
  });

  it("places the seven floors on the map", () => {
    const route = routeForAct(model, 1);
    expect(route.size).toBe(7);
    expect(model.maps[1].ancient).toBe("NEOW");
  });
});

describe("parseReplay on the records added after the first draft", () => {
  const journal = [
    { t: "header", s: 0, ms: 1, floor: 0, act: 1, seed: "SEED", start_time: 1, character: "REGENT", starting_deck: [{ c: 1, id: "STRIKE_REGENT" }] },
    { t: "room", s: 1, ms: 10, floor: 1, act: 1, kind: "merchant", coord: "1,0" },
    { t: "gold", s: 2, ms: 11, floor: 1, act: 1, gold: 140 },
    {
      t: "shop", s: 3, ms: 12, floor: 1, act: 1, gold: 140, removal_cost: 75, removal_stocked: true,
      cards: [
        { slot: 0, id: "FASTEN", cost: 87, stocked: true, sale: false, pool: "character" },
        { slot: 1, id: "FASTEN", cost: 52, stocked: true, sale: true, pool: "character" },
      ],
      relics: [{ slot: 0, id: "ANCHOR", cost: 150, stocked: true, sale: false }],
      potions: [],
    },
    { t: "buy", s: 4, ms: 20, floor: 1, act: 1, kind: "card", slot: 1, id: "FASTEN", cost_current: 52, cost_resource: "gold", gold_on_hand: 88 },
    { t: "acquire", s: 5, ms: 21, floor: 1, act: 1, source: "shop", c: 40, id: "FASTEN" },
    {
      t: "shop", s: 6, ms: 22, floor: 1, act: 1, gold: 88, removal_cost: 75, removal_stocked: true,
      cards: [
        { slot: 0, id: "FASTEN", cost: 87, stocked: true, sale: false, pool: "character" },
        { slot: 1, id: "FASTEN", cost: 52, stocked: false, sale: true, pool: "character" },
      ],
      relics: [{ slot: 0, id: "ANCHOR", cost: 150, stocked: true, sale: false }],
      potions: [],
    },
    { t: "resume", s: 7, ms: 3, floor: 1, act: 1, reloads: 2, wall_clock: 1788671437, run_time: 4211.5, hp: 48, gold: 88, deck_size: 14 },
    { t: "room", s: 8, ms: 500, floor: 2, act: 1, kind: "combat", id: "SLIMES_WEAK", coord: "1,1" },
    { t: "wibble", s: 9, ms: 501, floor: 2, act: 1, anything: true },
    { t: "end", s: 10, ms: 900, floor: 2, act: 1, terminal_reason: "abandon", hp: 48, max_hp: 80, final_deck: [{ c: 1, id: "STRIKE_REGENT" }, { c: 40, id: "FASTEN" }] },
  ]
    .map((l) => JSON.stringify(l))
    .join("\n");
  const model = parseReplay(journal);

  it("keeps the first shop line as the offer set and tracks gold through the purchase", () => {
    const shop = model.floors[0];
    expect(shop.shop?.cards.map((c) => c.cost)).toEqual([87, 52]);
    expect(shop.shop?.cards[1].sale).toBe(true);
    expect(shop.shop?.removalCost).toBe(75);
    expect(shop.goldAfter).toBe(88);
    const buy = shop.lines.find((l) => l.t === "buy");
    expect(buy && buy.t === "buy" ? buy.slot : undefined).toBe(1);
  });

  it("records resumes on the floor and the reload count on the model", () => {
    expect(model.floors[0].resumes).toHaveLength(1);
    expect(model.floors[0].resumes[0].runTime).toBe(4211.5);
    expect(model.reloads).toBe(2);
    expect(model.floors[1].hpAfter).toBe(48);
  });

  it("keeps unknown record kinds instead of dropping them", () => {
    const odd = model.floors[1].lines.find((l) => l.t === "unknown");
    expect(odd && odd.t === "unknown" ? odd.kind : undefined).toBe("wibble");
    expect(model.end?.maxHp).toBe(80);
    expect(model.finalDeck).toHaveLength(2);
  });
});

describe("parseReplay edge cases the reviewers named", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, starting_deck: [{ c: 1, id: "STRIKE_REGENT" }, { c: 2, id: "DEFEND_REGENT" }] };

  it("pairs resolutions with decision id 0", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 1, act: 1, kind: "event", id: "NEOW" },
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 0, decision_type: "event", source: "event", options: [{ option_index: 0, option_id: "A" }, { option_index: 1, option_id: "B" }] },
        { t: "acquire", s: 3, floor: 1, act: 1, decision_id: 0, id: "STRIKE_REGENT", c: 9, option_index: 1 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, true]);
    expect(dec.resolutions).toHaveLength(1);
  });

  it("marks the transformed source card when from_c is absent", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 1, act: 1, kind: "event", id: "X" },
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 4, decision_type: "card_select", select_kind: "transform", source: "event", options: [{ option_index: 0, option_kind: "transform", option_id: "STRIKE_REGENT" }, { option_index: 1, option_kind: "transform", option_id: "DEFEND_REGENT" }] },
        { t: "transform", s: 3, floor: 1, act: 1, decision_id: 4, from_id: "DEFEND_REGENT", to_id: "STRIKE_REGENT" },
      ]),
    );
    expect(model.floors[0].decisions[0].options.map((o) => o.chosen)).toEqual([false, true]);
  });

  it("gives only act 1 an ancient node and wires a recorder-placed boss", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "map", s: 1, floor: 0, act: 1, boss: "B1", boss_coord: "1,3", nodes: [{ coord: "1,1", kind: "monster", children: ["1,2"] }, { coord: "1,2", kind: "elite", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "event", id: "NEOW" },
        { t: "room", s: 3, floor: 2, act: 1, kind: "combat", id: "M", coord: "1,1" },
        { t: "act", s: 4, floor: 3, act: 2, name: "HIVE" },
        { t: "map", s: 5, floor: 3, act: 2, boss: "B2", nodes: [{ coord: "0,1", kind: "event", children: [] }] },
        { t: "room", s: 6, floor: 3, act: 2, kind: "event", id: "CURSED_TOME", coord: "0,1" },
      ]),
    );
    expect(model.maps[1].nodes.some((n) => n[2] === "ancient")).toBe(true);
    expect(model.maps[1].ancient).toBe("NEOW");
    expect(model.maps[1].edges).toContainEqual([1, 2, 1, 3]);
    expect(model.maps[2].nodes.some((n) => n[2] === "ancient")).toBe(false);
    expect(model.maps[2].ancient).toBeUndefined();
    const route = routeForAct(model, 1);
    expect(route.get(1)).toEqual([1, 0]);
    expect(route.get(2)).toEqual([1, 1]);
  });

  it("keeps turn 0, snapshots hp from resume and combat end, and routes burly monsters as combat", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "map", s: 1, floor: 0, act: 1, nodes: [{ coord: "0,0", kind: "burly_monster", children: [] }, { coord: "1,0", kind: "shop", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "combat", id: "BIG" },
        { t: "combat_start", s: 3, floor: 1, act: 1, encounter: "BIG", enemies: [] },
        { t: "turn", s: 4, floor: 1, act: 1, n: 0, side: "player" },
        { t: "combat_end", s: 5, floor: 1, act: 1, turns: 1, hp: 41 },
        { t: "resume", s: 6, floor: 1, act: 1, reloads: 1, hp: 35, gold: 12 },
      ]),
    );
    const f = model.floors[0];
    expect(f.combat?.turns[0].n).toBe(0);
    expect(f.resumes[0].hp).toBe(35);
    expect(f.hpAfter).toBe(35);
    expect(f.goldAfter).toBe(12);
    expect(isCombatKind("burly_monster")).toBe(true);
    expect(routeForAct(model, 1).get(1)).toEqual([0, 0]);
  });

  it("counts malformed interior lines but tolerates a torn tail", () => {
    const text = journal([header, { t: "room", s: 1, floor: 1, act: 1, kind: "event" }]) + "\n{not json\n" + JSON.stringify({ t: "gold", s: 2, floor: 1, act: 1, gold: 5 }) + "\n{\"t\":\"hp\",\"s\":3,\"h";
    const parsed = parseReplayLines(text);
    expect(parsed.malformed).toBe(1);
    expect(parsed.lines).toHaveLength(3);
    expect(parseReplay(text).malformedLines).toBe(1);
  });

  it("marks a shop purchase by slot so duplicate shelf cards resolve to the right one", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 1, act: 1, kind: "merchant" },
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 7, decision_type: "shop", source: "shop", options: [{ option_index: 0, option_kind: "card", option_id: "FASTEN" }, { option_index: 1, option_kind: "card", option_id: "FASTEN" }] },
        { t: "buy", s: 3, floor: 1, act: 1, decision_id: 7, kind: "card", slot: 1, id: "FASTEN", cost_current: 52, cost_resource: "gold", gold_on_hand: 88 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, true]);
    expect(dec.paid?.cost).toBe(52);
  });

  it("rejects partial coordinates", () => {
    const model = parseReplay(journal([header, { t: "room", s: 1, floor: 1, act: 1, kind: "event", coord: "3" }, { t: "room", s: 2, floor: 2, act: 1, kind: "event", coord: "3,4,5" }]));
    expect(model.floors.map((f) => f.coord)).toEqual([undefined, undefined]);
  });
});
