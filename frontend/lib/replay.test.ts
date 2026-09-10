import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureIsComplete, combatCounts, hasMapPositions, isCombatKind, parseReplay, parseReplayLines, routeForAct, type BuyLine, type PlayLine, type ShopLine } from "./replay";

const JOURNAL = readFileSync(new URL("../../backend/tests/fixtures/real-replay.jsonl", import.meta.url), "utf-8");

function journal(records: Record<string, unknown>[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

describe("parseReplay on the real journal", () => {
  const model = parseReplay(JOURNAL);

  it("splits the run into floors with the act map", () => {
    expect(model.lineCount).toBe(994);
    expect(model.floors).toHaveLength(17);
    // Exactly the nodes the recorder wrote. The boss and Ancient nodes the
    // viewer used to append, and the names it read off the floor list, are gone.
    expect(model.maps[1].nodes).toHaveLength(56);
    expect(model.maps[1].boss).toBeUndefined();
    expect(model.maps[1].ancient).toBeUndefined();
    expect(model.maps[1].edges.length).toBeGreaterThan(56);
    expect(model.actNames[1]).toBe("OVERGROWTH");
    expect(model.startingDeck).toHaveLength(13);
    expect(model.finalDeck.map((c) => c.c)).toContain(128);
    expect(model.end?.terminalReason).toBe("death");
  });

  it("attaches combats with turns and leaves the interrupted last fight unended", () => {
    const fighting = model.floors.filter((f) => f.combats.length);
    expect(fighting).toHaveLength(6);
    expect(fighting.every((f) => isCombatKind(f.kind))).toBe(true);
    const all = model.floors.flatMap((f) => f.combats);
    expect(all).toHaveLength(6);
    expect(all.reduce((n, c) => n + c.turns.length, 0)).toBe(76);
    const last = all[all.length - 1];
    // The run's terminal reason is the run's, not this fight's.
    expect(last.endRecorded).toBe(false);
    expect(last.result).toBeUndefined();
    const first = all[0];
    expect(first.encounter).toBe("NIBBITS_WEAK");
    expect(first.endRecorded).toBe(true);
    // This recorder writes no result on combat_end, so every "Victory" the
    // viewer used to show for these fights was the default, not the journal.
    expect(first.result).toBeUndefined();
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

  it("reports every floor of the act as unplaced when the recorder wrote no coordinates", () => {
    const route = routeForAct(model, 1);
    expect(route).toHaveLength(17);
    expect(route.every((e) => e.coord === undefined)).toBe(true);
    expect(route.map((e) => e.floor.floor)).toEqual(model.floors.filter((f) => f.act === 1).map((f) => f.floor));
    expect(hasMapPositions(model)).toBe(false);
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
    expect(model.floors.filter((f) => f.combats.length)).toHaveLength(5);
  });

  it("keeps end_turn lines inside their turn and deck ids on plays", () => {
    const first = model.floors.find((f) => f.combats.length)!.combats[0];
    expect(first.turns.some((tn) => tn.lines.some((l) => l.t === "end_turn"))).toBe(true);
    const play = first.turns[0].lines.find((l): l is PlayLine => l.t === "play")!;
    expect(play.deckC).toBe(7);
    // The last fight was interrupted by the death, so it carries no result.
    const lastFight = model.floors[model.floors.length - 1].combats[0];
    expect(lastFight.endRecorded).toBe(false);
    expect(lastFight.result).toBeUndefined();
  });

  it("lists the seven floors and places none of them", () => {
    const route = routeForAct(model, 1);
    expect(route).toHaveLength(7);
    expect(route.every((e) => e.coord === undefined)).toBe(true);
    expect(model.maps[1].ancient).toBeUndefined();
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

  it("leaves a transform unmatched when the journal recorded no source instance", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 1, act: 1, kind: "event", id: "X" },
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 4, decision_type: "card_select", select_kind: "transform", source: "event", options: [{ option_index: 0, option_kind: "transform", option_id: "STRIKE_REGENT" }, { option_index: 1, option_kind: "transform", option_id: "DEFEND_REGENT" }] },
        { t: "transform", s: 3, floor: 1, act: 1, decision_id: 4, from_id: "DEFEND_REGENT", to_id: "STRIKE_REGENT" },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    // The card id names a type. A deck can hold two Defends, so it does not
    // name the option that was picked.
    expect(dec.options.map((o) => o.chosen)).toEqual([false, false]);
    expect(dec.selectionStatus).toBe("unknown");
    expect(dec.resolutions).toHaveLength(1);
  });

  it("matches a transform on the source instance when the journal recorded one", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 1, act: 1, kind: "event", id: "X" },
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 4, decision_type: "card_select", select_kind: "transform", source: "event", options: [{ option_index: 0, option_kind: "transform", option_id: "STRIKE_REGENT", instance_id: 1 }, { option_index: 1, option_kind: "transform", option_id: "STRIKE_REGENT", instance_id: 2 }] },
        { t: "transform", s: 3, floor: 1, act: 1, decision_id: 4, from_id: "STRIKE_REGENT", from_c: 2, to_id: "DEFEND_REGENT" },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, true]);
    expect(dec.selectionStatus).toBe("known");
  });

  it("keeps a recorder-placed boss and invents no ancient node or name", () => {
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
    // The recorder placed the boss, so it stays. Nothing else is added.
    expect(model.maps[1].boss).toBe("B1");
    expect(model.maps[1].nodes.some((n) => n[2] === "boss")).toBe(true);
    expect(model.maps[1].nodes.some((n) => n[2] === "ancient")).toBe(false);
    expect(model.maps[1].ancient).toBeUndefined();
    expect(model.maps[1].edges).not.toContainEqual([1, 2, 1, 3]);
    const route = routeForAct(model, 1);
    // Floor 1 has no recorded coordinate, so it gets none. Floor 2 keeps its own.
    expect(route[0].coord).toBeUndefined();
    expect(route[1].coord).toEqual([1, 1]);
  });

  it("does not name a boss from an encounter id that merely contains BOSS", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "map", s: 1, floor: 0, act: 1, nodes: [{ coord: "0,0", kind: "monster", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "combat", id: "SOMETHING_BOSS", coord: "0,0" },
      ]),
    );
    expect(model.maps[1].boss).toBeUndefined();
  });

  it("reports a recorded coordinate the map has no node for instead of moving it", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "map", s: 1, floor: 0, act: 1, nodes: [{ coord: "0,0", kind: "monster", children: ["0,1"] }, { coord: "0,1", kind: "monster", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "combat", id: "A", coord: "9,9" },
      ]),
    );
    const [entry] = routeForAct(model, 1);
    expect(entry.coord).toEqual([9, 9]);
    expect(entry.offMap).toBe(true);
  });

  it("keeps a gap between two known positions instead of bridging it", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "map", s: 1, floor: 0, act: 1, nodes: [{ coord: "0,0", kind: "monster", children: ["0,1"] }, { coord: "0,1", kind: "monster", children: ["0,2"] }, { coord: "0,2", kind: "monster", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "combat", id: "A", coord: "0,0" },
        { t: "room", s: 3, floor: 2, act: 1, kind: "combat", id: "B" },
        { t: "room", s: 4, floor: 3, act: 1, kind: "combat", id: "C", coord: "0,2" },
      ]),
    );
    const route = routeForAct(model, 1);
    expect(route.map((e) => e.coord)).toEqual([[0, 0], undefined, [0, 2]]);
    // The journal did record positions here, so floor 2 is a real gap.
    expect(hasMapPositions(model)).toBe(true);
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
    expect(f.combats[0].turns[0].n).toBe(0);
    expect(f.resumes[0].hp).toBe(35);
    expect(f.hpAfter).toBe(35);
    expect(f.goldAfter).toBe(12);
    expect(isCombatKind("burly_monster")).toBe(true);
    expect(routeForAct(model, 1)[0].coord).toBeUndefined();
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

describe("the parser never invents a fact the journal did not record", () => {
  it("leaves a decision with no id unlinked instead of giving it id 0", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "room", s: 1, floor: 1, kind: "monster" },
        // Two decisions, neither identified. Defaulting both to 0 used to make
        // the second overwrite the first and swallow the outcome below.
        { t: "decision", s: 2, floor: 1, decision_type: "card_reward", options: [{ option_id: "STRIKE" }] },
        { t: "decision", s: 3, floor: 1, decision_type: "card_reward", options: [{ option_id: "DEFEND" }] },
        { t: "outcome", s: 4, floor: 1, outcome: "chosen", option_id: "STRIKE" },
      ]),
    );
    const [floor] = model.floors;
    expect(floor.decisions).toHaveLength(2);
    expect(floor.decisions.map((d) => d.id)).toEqual([undefined, undefined]);
    // An outcome with no decision id attaches to nothing rather than the wrong one.
    expect(floor.decisions.every((d) => d.options.every((o) => !o.chosen))).toBe(true);
  });

  it("keeps a real decision id of zero", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "room", s: 1, floor: 1, kind: "monster" },
        { t: "decision", s: 2, floor: 1, decision_id: 0, decision_type: "card_reward", options: [{ option_id: "STRIKE" }] },
        { t: "outcome", s: 3, floor: 1, decision_id: 0, outcome: "chosen", option_id: "STRIKE" },
      ]),
    );
    const [decision] = model.floors[0].decisions;
    expect(decision.id).toBe(0);
    expect(decision.options[0].chosen).toBe(true);
  });

  it("leaves the offered count unknown rather than counting options the game may not have shown", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "room", s: 1, floor: 1, kind: "monster" },
        {
          t: "decision",
          s: 2,
          floor: 1,
          decision_id: 1,
          decision_type: "card_reward",
          options: [{ option_id: "A" }, { option_id: "B" }, { option_id: "C", presented: false }],
        },
      ]),
    );
    const [decision] = model.floors[0].decisions;
    expect(decision.nPresented).toBeUndefined();
    expect(decision.nSelectable).toBeUndefined();
    expect(decision.options).toHaveLength(3);
  });

  it("reports a count the journal did record", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "room", s: 1, floor: 1, kind: "monster" },
        { t: "decision", s: 2, floor: 1, decision_id: 1, n_presented: 2, n_selectable: 1, options: [{ option_id: "A" }] },
      ]),
    );
    expect(model.floors[0].decisions[0].nPresented).toBe(2);
    expect(model.floors[0].decisions[0].nSelectable).toBe(1);
  });

  it("ignores an identity that is not a safe integer", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "room", s: 1, floor: 1, kind: "monster" },
        { t: "decision", s: 2, floor: 1, decision_id: 1.5, options: [{ option_id: "A" }] },
        { t: "decision", s: 3, floor: 1, decision_id: "7", options: [{ option_id: "B" }] },
      ]),
    );
    expect(model.floors[0].decisions.map((d) => d.id)).toEqual([undefined, undefined]);
  });

  it("keeps an option in its recorded position when a neighbour is malformed", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "room", s: 1, floor: 1, kind: "monster" },
        { t: "decision", s: 2, floor: 1, decision_id: 1, options: [null, { option_id: "B" }] },
        { t: "outcome", s: 3, floor: 1, decision_id: 1, outcome: "chosen", option_index: 1 },
      ]),
    );
    const [decision] = model.floors[0].decisions;
    const chosen = decision.options.filter((o) => o.chosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].id).toBe("B");
  });

  it("survives a room kind that names an inherited object property", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0 },
        { t: "map", s: 1, act: 1, nodes: [{ coord: "0,0", kind: "monster", children: ["0,1"] }, { coord: "0,1", kind: "monster", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "constructor" },
        { t: "room", s: 3, floor: 2, act: 1, kind: "__proto__" },
      ]),
    );
    expect(() => routeForAct(model, 1)).not.toThrow();
  });
});

describe("the parser only marks a pick the journal actually identified", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const room = { t: "room", s: 1, floor: 1, act: 1, kind: "event", id: "X" };
  const twoOfAKind = {
    t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", source: "reward",
    options: [{ option_index: 0, option_kind: "card", option_id: "STRIKE" }, { option_index: 1, option_kind: "card", option_id: "STRIKE" }],
  };

  it("marks neither of two identical offers from an acquisition that only names the card", () => {
    const model = parseReplay(journal([header, room, twoOfAKind, { t: "acquire", s: 3, floor: 1, act: 1, decision_id: 1, id: "STRIKE", c: 40 }]));
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, false]);
    expect(dec.selectionStatus).toBe("unknown");
    // The acquisition itself is still recorded, it just is not proof of which offer.
    expect(dec.resolutions).toHaveLength(1);
  });

  it("uses an explicit option index to pick the right duplicate", () => {
    const model = parseReplay(journal([header, room, twoOfAKind, { t: "acquire", s: 3, floor: 1, act: 1, decision_id: 1, id: "STRIKE", c: 40, option_index: 1 }]));
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, true]);
    expect(dec.selectionStatus).toBe("known");
  });

  it("does not pick an option when two explicit identifiers disagree", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_select", select_kind: "remove", source: "shop", max_select: 1, options: [{ option_index: 0, option_kind: "remove", option_id: "STRIKE", instance_id: 10 }, { option_index: 1, option_kind: "remove", option_id: "STRIKE", instance_id: 11 }] },
        { t: "remove", s: 3, floor: 1, act: 1, decision_id: 1, id: "STRIKE", c: 11, option_index: 0 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, false]);
    expect(dec.selectionStatus).toBe("conflict");
  });

  it("keeps both picks of a recorded multi-select", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "deck_select", source: "event", min_select: 2, max_select: 2, options: [{ option_index: 0, option_id: "A" }, { option_index: 1, option_id: "B" }, { option_index: 2, option_id: "C" }] },
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "deck_select", outcome: "chosen", selected_option_indices: [0, 2] },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([true, false, true]);
    expect(dec.selectionStatus).toBe("known");
  });

  it("reads an empty selection list as a recorded decline, not a missing record", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "deck_select", source: "event", max_select: 2, decline_available: true, options: [{ option_index: 0, option_id: "A" }] },
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "deck_select", outcome: "decline", selected_option_indices: [] },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.every((o) => !o.chosen)).toBe(true);
    expect(dec.selectionStatus).toBe("known");
  });

  it("does not turn an unresolved decision into a confirmed choice", () => {
    const model = parseReplay(journal([header, room, twoOfAKind, { t: "relic", s: 3, floor: 1, act: 1, decision_id: 1, id: "SOMETHING_ELSE" }]));
    const dec = model.floors[0].decisions[0];
    expect(dec.selectionStatus).toBe("unknown");
    expect(dec.outcome).toBeUndefined();
    expect(dec.options.every((o) => !o.chosen)).toBe(true);
  });

  it("reports partial when one record identifies an option and another does not", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", source: "reward", options: [{ option_index: 0, option_id: "A" }, { option_index: 1, option_id: "B" }] },
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", outcome: "chosen", option_id: "B" },
        { t: "acquire", s: 4, floor: 1, act: 1, decision_id: 1, id: "B", c: 40, option_index: 7 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, true]);
    expect(dec.selectionStatus).toBe("partial");
  });

  it("keeps a shop slot inside its own item kind", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "shop", source: "shop", max_select: 1, options: [{ option_index: 0, option_kind: "relic", option_id: "R0" }, { option_index: 1, option_kind: "card", option_id: "C0" }] },
        { t: "buy", s: 3, floor: 1, act: 1, decision_id: 1, kind: "card", slot: 1, id: "C0", cost_current: 50, cost_resource: "gold" },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([false, true]);
    expect(dec.paid?.kind).toBe("card");
  });

  it("resolves the removed Strike by instance where the shop stocked five of them", () => {
    const coords = readFileSync(new URL("../../backend/tests/fixtures/real-replay-coords.jsonl", import.meta.url), "utf-8");
    const model = parseReplay(coords);
    const removal = model.floors.flatMap((f) => f.decisions).find((d) => d.paid?.kind === "removal_service");
    expect(removal).toBeDefined();
    expect(removal!.options.filter((o) => o.id === "STRIKE_IRONCLAD")).toHaveLength(5);
    const picked = removal!.options.filter((o) => o.chosen);
    expect(picked).toHaveLength(1);
    expect(removal!.selectionStatus).toBe("known");
  });
});

describe("parseReplay on the journal that records map positions", () => {
  const model = parseReplay(readFileSync(new URL("../../backend/tests/fixtures/real-replay-coords.jsonl", import.meta.url), "utf-8"));

  it("places every floor from the recorder's own coordinates", () => {
    expect(hasMapPositions(model)).toBe(true);
    const route = [1, 2].flatMap((act) => routeForAct(model, act));
    expect(route).toHaveLength(model.floors.length);
    expect(route.every((e) => e.coord !== undefined)).toBe(true);
  });

  it("reports the Ancient rooms as off the recorded grid rather than inventing a node for them", () => {
    // Each act's Ancient sits on row 0 and the recorded node grid starts at
    // row 1, so the recorder never emitted a node for it. The viewer used to
    // manufacture one, guess its column and wire it to every node on row 1.
    const off = [1, 2].flatMap((act) => routeForAct(model, act)).filter((e) => e.offMap);
    expect(off.map((e) => e.floor.id)).toEqual(["NEOW", "TEZCATARA"]);
    expect(off.map((e) => e.coord)).toEqual([[3, 0], [3, 0]]);
    expect(model.maps[1].nodes.some((n) => n[2] === "ancient")).toBe(false);
  });

  it("keeps the boss the recorder named and its placed node", () => {
    expect(model.maps[1].boss).toBe("THE_KIN_BOSS");
    expect(model.maps[1].nodes.some((n) => n[2] === "boss")).toBe(true);
    expect(model.maps[1].ancient).toBeUndefined();
  });
});

describe("a floor keeps every fight the journal recorded", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const room = { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" };

  it("renders two complete fights on one floor instead of only the last", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "ONE", enemies: [], combat_id: "1.1:AXEBOT" },
        { t: "turn", s: 3, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:AXEBOT" },
        { t: "combat_end", s: 4, floor: 1, act: 1, turns: 1, hp: 50, result: "victory", combat_id: "1.1:AXEBOT" },
        { t: "combat_start", s: 5, floor: 1, act: 1, encounter: "TWO", enemies: [], combat_id: "1.1:CHOMPER" },
        { t: "turn", s: 6, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:CHOMPER" },
        { t: "turn", s: 7, floor: 1, act: 1, n: 1, side: "player", combat_id: "1.1:CHOMPER" },
        { t: "combat_end", s: 8, floor: 1, act: 1, turns: 2, hp: 44, result: "victory", combat_id: "1.1:CHOMPER" },
      ]),
    );
    const [c1, c2] = model.floors[0].combats;
    expect(model.floors[0].combats).toHaveLength(2);
    expect([c1.encounter, c2.encounter]).toEqual(["ONE", "TWO"]);
    expect([c1.turns.length, c2.turns.length]).toEqual([1, 2]);
    expect([c1.hpEnd, c2.hpEnd]).toEqual([50, 44]);
    expect([c1.result, c2.result]).toEqual(["victory", "victory"]);
    expect(c1.endRecorded && c2.endRecorded).toBe(true);
  });

  it("keeps an unended fight when the next one starts, and leaks no turns between them", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "ONE", enemies: [], combat_id: "1.1:AXEBOT" },
        { t: "turn", s: 3, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:AXEBOT" },
        { t: "combat_start", s: 4, floor: 1, act: 1, encounter: "TWO", enemies: [], combat_id: "1.1:CHOMPER" },
        { t: "turn", s: 5, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:CHOMPER" },
        { t: "combat_end", s: 6, floor: 1, act: 1, turns: 1, result: "victory", combat_id: "1.1:CHOMPER" },
      ]),
    );
    const [c1, c2] = model.floors[0].combats;
    expect(c1.endRecorded).toBe(false);
    expect(c1.result).toBeUndefined();
    expect(c1.turns).toHaveLength(1);
    expect(c2.turns).toHaveLength(1);
    expect(c2.endRecorded).toBe(true);
  });

  it("does not fold a turn that names a different fight into the running one", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "ONE", enemies: [], combat_id: "1.1:AXEBOT" },
        { t: "turn", s: 3, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:OTHER" },
      ]),
    );
    expect(model.floors[0].combats[0].turns).toHaveLength(0);
  });

  it("does not call a fight a win when the end reported no result", () => {
    const model = parseReplay(
      journal([header, room, { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "ONE", enemies: [] }, { t: "combat_end", s: 3, floor: 1, act: 1, turns: 3 }]),
    );
    const c = model.floors[0].combats[0];
    expect(c.endRecorded).toBe(true);
    expect(c.result).toBeUndefined();
  });

  it("does not merge two fights that share an encounter id", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "SAME", enemies: [], combat_id: "1.1:AXEBOT" },
        { t: "combat_end", s: 3, floor: 1, act: 1, turns: 1, combat_id: "1.1:AXEBOT" },
        { t: "combat_start", s: 4, floor: 1, act: 1, encounter: "SAME", enemies: [], combat_id: "1.1:CHOMPER" },
        { t: "combat_end", s: 5, floor: 1, act: 1, turns: 1, combat_id: "1.1:CHOMPER" },
      ]),
    );
    expect(model.floors[0].combats).toHaveLength(2);
    expect(model.floors[0].combats.map((c) => c.combatId)).toEqual(["1.1:AXEBOT", "1.1:CHOMPER"]);
  });

  it("keeps a reload attempt distinguishable from the fight it restarted", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "ONE", enemies: [], combat_id: "1.1:AXEBOT", attempt_id: 0 },
        { t: "combat_start", s: 3, floor: 1, act: 1, encounter: "ONE", enemies: [], combat_id: "1.1:AXEBOT", attempt_id: 1 },
      ]),
    );
    const [a, b] = model.floors[0].combats;
    expect([a.attemptId, b.attemptId]).toEqual([0, 1]);
    expect(a.endRecorded).toBe(false);
  });
});

describe("HP lost is reported only where the journal supports a total", () => {
  const v1 = { t: "header", s: 0, ms: 1, floor: 0, act: 1, starting_deck: [] };
  const v2 = { ...v1, replay_version: 2 };
  const fight = (lines: Record<string, unknown>[], header: Record<string, unknown> = v1) =>
    parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
        { t: "hp", s: 2, floor: 1, act: 1, hp: 60, d: 0 },
        { t: "combat_start", s: 3, floor: 1, act: 1, encounter: "E", enemies: [] },
        ...lines,
      ]),
    ).floors[0].combats[0];

  it("never presents recorded losses as the fight's total", () => {
    const c = fight([
      { t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "combat_end", s: 5, floor: 1, act: 1, turns: 1, hp: 53 },
    ]);
    // Consistent is not complete: an unrecorded loss and an unrecorded heal of
    // the same size would leave every recorded value reconciling.
    expect(c.hpLost).toBeUndefined();
    expect(c.hpLossRecorded).toBe(7);
  });

  it("does not let healing cancel an earlier loss in the recorded sum", () => {
    const c = fight([
      { t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "hp", s: 5, floor: 1, act: 1, hp: 56, d: 3 },
      { t: "hp", s: 6, floor: 1, act: 1, hp: 51, d: -5 },
      { t: "combat_end", s: 7, floor: 1, act: 1, turns: 3, hp: 51 },
    ]);
    expect(c.hpLossRecorded).toBe(12);
  });

  it("records zero for a fight whose start and end HP agree with no changes", () => {
    const c = fight([{ t: "combat_end", s: 4, floor: 1, act: 1, turns: 1, hp: 60 }]);
    expect(c.hpLossRecorded).toBe(0);
  });

  it("does not claim zero when the fight ended on different HP than it started", () => {
    // The old code reported 0 here: no in-combat hp line contradicted anything,
    // so a ten HP discrepancy passed as a measured zero.
    const c = fight([{ t: "combat_end", s: 4, floor: 1, act: 1, turns: 1, hp: 50 }]);
    expect(c.hpLossRecorded).toBeUndefined();
    expect(c.hpLost).toBeUndefined();
  });

  it("gives up when one HP change went unrecorded", () => {
    const c = fight([
      { t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "hp", s: 5, floor: 1, act: 1, hp: 40, d: -5 },
      { t: "combat_end", s: 6, floor: 1, act: 1, turns: 2, hp: 40 },
    ]);
    expect(c.hpLossRecorded).toBeUndefined();
  });

  it("does not double count one loss reported twice", () => {
    const c = fight([
      { t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "hp", s: 5, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "combat_end", s: 6, floor: 1, act: 1, turns: 1, hp: 53 },
    ]);
    expect(c.hpLossRecorded).toBeUndefined();
  });

  it("never sums hp_loss lines, which can describe an event a second time", () => {
    const c = fight([
      { t: "hp_loss", s: 4, floor: 1, act: 1, dmg: 7, blocked: 0 },
      { t: "combat_end", s: 5, floor: 1, act: 1, turns: 1, hp: 60 },
    ]);
    expect(c.hpLossRecorded).toBe(0);
  });

  it("takes the recorder's own total and does not derive one alongside it", () => {
    const c = fight([
      { t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "combat_end", s: 5, floor: 1, act: 1, turns: 1, hp: 53, hp_lost_total: 19 },
    ], v2);
    expect(c.hpLost).toBe(19);
    expect(c.hpLossRecorded).toBeUndefined();
  });

  it("leaves a version 2 fight unknown when the recorder sent no total", () => {
    // Below version 2 there is no total to miss. From version 2 its absence is
    // the recorder saying it could not supply one, so nothing stands in for it.
    const c = fight([
      { t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 },
      { t: "combat_end", s: 5, floor: 1, act: 1, turns: 1, hp: 53 },
    ], v2);
    expect(c.hpLost).toBeUndefined();
    expect(c.hpLossRecorded).toBeUndefined();
  });

  it("leaves the recorded sum unknown when the HP before the fight was never recorded", () => {
    const model = parseReplay(
      journal([
        v1,
        { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "E", enemies: [] },
        { t: "hp", s: 3, floor: 1, act: 1, hp: 53, d: -7 },
        { t: "combat_end", s: 4, floor: 1, act: 1, turns: 1, hp: 53 },
      ]),
    );
    expect(model.floors[0].combats[0].hpLossRecorded).toBeUndefined();
  });

  it("reports nothing for a fight the journal never ended", () => {
    const c = fight([{ t: "hp", s: 4, floor: 1, act: 1, hp: 53, d: -7 }]);
    expect(c.endRecorded).toBe(false);
    expect(c.hpLost).toBeUndefined();
    expect(c.hpLossRecorded).toBeUndefined();
  });
});

describe("selection records have to agree, not merely coexist", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const room = { t: "room", s: 1, floor: 1, act: 1, kind: "event", id: "X" };
  const twoInstances = {
    t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "deck_select", select_kind: "remove", source: "event", max_select: 2,
    options: [{ option_index: 0, option_kind: "remove", option_id: "STRIKE", instance_id: 10 }, { option_index: 1, option_kind: "remove", option_id: "STRIKE", instance_id: 11 }],
  };

  it("calls one record naming two different options a conflict, even in a multi-select", () => {
    const model = parseReplay(journal([header, room, twoInstances, { t: "remove", s: 3, floor: 1, act: 1, decision_id: 1, id: "STRIKE", c: 11, option_index: 0 }]));
    const dec = model.floors[0].decisions[0];
    expect(dec.selectionStatus).toBe("conflict");
    expect(dec.options.every((o) => !o.chosen)).toBe(true);
  });

  it("treats a recorded selection list as complete, so a pick outside it conflicts", () => {
    const model = parseReplay(
      journal([
        header, room, twoInstances,
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "deck_select", outcome: "chosen", selected_option_indices: [0] },
        { t: "remove", s: 4, floor: 1, act: 1, decision_id: 1, id: "STRIKE", c: 11 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.selectionStatus).toBe("conflict");
    expect(dec.options.every((o) => !o.chosen)).toBe(true);
  });

  it("conflicts when an explicit decline sits alongside an identified pick", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", source: "reward", options: [{ option_index: 0, option_kind: "card", option_id: "A" }] },
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", outcome: "skip", selected_option_indices: [] },
        { t: "acquire", s: 4, floor: 1, act: 1, decision_id: 1, id: "A", c: 40, option_index: 0 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    // Previously this rendered "Skipped" and "Taken" at the same time.
    expect(dec.selectionStatus).toBe("conflict");
    expect(dec.options.every((o) => !o.chosen)).toBe(true);
  });

  it("conflicts when more options are identified than the decision allowed", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", source: "reward", max_select: 2, options: [{ option_index: 0, option_kind: "card", option_id: "A" }, { option_index: 1, option_kind: "card", option_id: "B" }, { option_index: 2, option_kind: "card", option_id: "C" }] },
        { t: "acquire", s: 3, floor: 1, act: 1, decision_id: 1, id: "A", c: 40, option_index: 0 },
        { t: "acquire", s: 4, floor: 1, act: 1, decision_id: 1, id: "B", c: 41, option_index: 1 },
        { t: "acquire", s: 5, floor: 1, act: 1, decision_id: 1, id: "C", c: 42, option_index: 2 },
      ]),
    );
    expect(model.floors[0].decisions[0].selectionStatus).toBe("conflict");
  });

  it("does not call a multi-select settled while one acquisition stays unidentified", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", source: "reward", max_select: 2, options: [{ option_index: 0, option_kind: "card", option_id: "A" }, { option_index: 1, option_kind: "card", option_id: "A" }] },
        { t: "acquire", s: 3, floor: 1, act: 1, decision_id: 1, id: "A", c: 40, option_index: 0 },
        // The recorder refuses to guess between duplicate offers, so this one
        // carries no index. It is still a pick that happened.
        { t: "acquire", s: 4, floor: 1, act: 1, decision_id: 1, id: "A", c: 41 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([true, false]);
    expect(dec.selectionStatus).toBe("partial");
  });

  it("reads an invalid selection list as unresolved rather than as a decline", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", source: "reward", options: [{ option_index: 0, option_kind: "card", option_id: "A" }] },
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "card_reward", outcome: "chosen", selected_option_indices: [null] },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.selectionStatus).toBe("unknown");
    expect(dec.options.every((o) => !o.chosen)).toBe(true);
  });

  it("keeps an event's card consequence from counting as a second choice", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "decision", s: 2, floor: 1, act: 1, decision_id: 1, decision_type: "event", source: "event", event_id: "SAPPHIRE_SEED", options: [{ option_index: 0, option_kind: "event_option", option_id: "SEED.EAT" }, { option_index: 1, option_kind: "event_option", option_id: "SEED.PLANT" }] },
        { t: "outcome", s: 3, floor: 1, act: 1, decision_id: 1, decision_type: "event", outcome: "chosen", option_id: "SEED.EAT" },
        { t: "upgrade", s: 4, floor: 1, act: 1, decision_id: 1, id: "TAUNT", c: 26 },
      ]),
    );
    const dec = model.floors[0].decisions[0];
    expect(dec.options.map((o) => o.chosen)).toEqual([true, false]);
    expect(dec.selectionStatus).toBe("known");
  });
});

describe("a fight's identity decides what belongs to it", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const room = { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" };

  it("does not let one attempt's end close another attempt of the same fight", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "E", enemies: [], combat_id: "1.1:AXEBOT", attempt_id: 1 },
        { t: "combat_end", s: 3, floor: 1, act: 1, turns: 4, result: "victory", combat_id: "1.1:AXEBOT", attempt_id: 0 },
      ]),
    );
    const c = model.floors[0].combats[0];
    expect(c.endRecorded).toBe(false);
    expect(c.result).toBeUndefined();
  });

  it("detaches later untagged actions when a turn names a different fight", () => {
    const model = parseReplay(
      journal([
        header, room,
        { t: "combat_start", s: 2, floor: 1, act: 1, encounter: "E", enemies: [], combat_id: "1.1:AXEBOT" },
        { t: "turn", s: 3, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:AXEBOT" },
        { t: "turn", s: 4, floor: 1, act: 1, n: 0, side: "player", combat_id: "1.1:OTHER" },
        { t: "play", s: 5, floor: 1, act: 1, id: "STRIKE" },
        { t: "hp", s: 6, floor: 1, act: 1, hp: 30, d: -10 },
      ]),
    );
    const c = model.floors[0].combats[0];
    expect(c.turns).toHaveLength(1);
    // The play and the hp change belong to the fight the journal moved to,
    // which this session never saw start, so they do not land here.
    expect(c.turns[0].lines).toHaveLength(0);
    expect(c.hpLossRecorded).toBeUndefined();
  });
});

describe("the map places a coordinate the recorder named on its own", () => {
  it("gives the Ancient a node from ancient_coord without inventing edges for it", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "map", s: 1, act: 1, boss: "B", boss_coord: "3,16", ancient: "NEOW", ancient_coord: "3,0", nodes: [{ coord: "3,1", kind: "monster", children: [] }] },
        { t: "room", s: 2, floor: 1, act: 1, kind: "event", id: "NEOW", coord: "3,0" },
      ]),
    );
    const map = model.maps[1];
    expect(map.ancient).toBe("NEOW");
    expect(map.nodes).toContainEqual([3, 0, "ancient"]);
    expect(map.nodes).toContainEqual([3, 16, "boss"]);
    // Placing a recorded room is not the same as knowing what it connects to.
    expect(map.edges).toHaveLength(0);
    // And with a node there, the room is no longer off the recorded map.
    expect(routeForAct(model, 1)[0].offMap).toBe(false);
  });

  it("prefers the recorder's own node over the bare coordinate", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "map", s: 1, act: 1, ancient: "NEOW", ancient_coord: "3,0", nodes: [{ coord: "3,0", kind: "ancient", children: ["2,1", "3,1"] }] },
      ]),
    );
    expect(model.maps[1].nodes.filter((n) => n[0] === 3 && n[1] === 0)).toHaveLength(1);
    expect(model.maps[1].edges).toEqual([[3, 0, 2, 1], [3, 0, 3, 1]]);
  });
});

describe("a reload restarts a fight, so only the last attempt happened", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };

  // The shape the recorder produces for a mid-fight reload: two starts sharing
  // a combat id, the abandoned one with no end at all.
  const reloaded = journal([
    header,
    { t: "room", s: 1, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
    { t: "hp", s: 2, floor: 21, act: 2, hp: 70, d: 0 },
    { t: "combat_start", s: 3, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT", attempt_id: 0 },
    { t: "turn", s: 4, floor: 21, act: 2, n: 0, side: "player", combat_id: "2.21:AXEBOT", attempt_id: 0 },
    { t: "combat_start", s: 5, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT", attempt_id: 1 },
    { t: "turn", s: 6, floor: 21, act: 2, n: 0, side: "player", combat_id: "2.21:AXEBOT", attempt_id: 1 },
    { t: "combat_end", s: 7, floor: 21, act: 2, turns: 1, result: "victory", combat_id: "2.21:AXEBOT", attempt_id: 1, hp_lost_total: 12 },
  ]);

  it("keeps both attempts but marks the abandoned one as thrown away", () => {
    const [first, second] = parseReplay(reloaded).floors[0].combats;
    expect(first.supersededByRetry).toBe(true);
    expect(first.endRecorded).toBe(false);
    expect(second.supersededByRetry).toBe(false);
    expect(second.hpLost).toBe(12);
  });

  it("counts the floor's HP loss once, from the attempt that stuck", () => {
    const kept = parseReplay(reloaded).floors[0].combats.filter((c) => !c.supersededByRetry);
    // Both attempts are real records. Adding them would charge the player for
    // damage the reload rolled back.
    expect(kept).toHaveLength(1);
    expect(kept.reduce((n, c) => n + (c.hpLost ?? 0), 0)).toBe(12);
  });

  it("does not call two different fights on one floor attempts at each other", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
        { t: "combat_start", s: 2, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT", attempt_id: 0 },
        { t: "combat_end", s: 3, floor: 21, act: 2, turns: 1, result: "victory", combat_id: "2.21:AXEBOT", attempt_id: 0, hp_lost_total: 5 },
        { t: "combat_start", s: 4, floor: 21, act: 2, encounter: "CHOMPER", enemies: [], combat_id: "2.21:CHOMPER", attempt_id: 0 },
        { t: "combat_end", s: 5, floor: 21, act: 2, turns: 1, result: "victory", combat_id: "2.21:CHOMPER", attempt_id: 0, hp_lost_total: 8 },
      ]),
    );
    const cs = model.floors[0].combats;
    expect(cs.every((c) => !c.supersededByRetry)).toBe(true);
    expect(cs.reduce((n, c) => n + (c.hpLost ?? 0), 0)).toBe(13);
  });
});

describe("a reload either restarts a fight or carries on inside it", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const opening = [
    header,
    { t: "room", s: 1, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
    { t: "hp", s: 2, floor: 21, act: 2, hp: 70, d: 0 },
    { t: "combat_start", s: 3, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT", attempt_id: 0 },
    { t: "turn", s: 4, floor: 21, act: 2, n: 1, side: "player", combat_id: "2.21:AXEBOT", attempt_id: 0 },
  ];

  it("undoes the earlier attempt when a fresh start follows the resume", () => {
    const model = parseReplay(
      journal([
        ...opening,
        { t: "resume", s: 5, floor: 21, act: 2, reloads: 1, hp: 70, gold: 100 },
        { t: "combat_start", s: 6, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT", attempt_id: 1 },
        { t: "combat_end", s: 7, floor: 21, act: 2, turns: 2, result: "victory", combat_id: "2.21:AXEBOT", attempt_id: 1, hp_lost_total: 9 },
      ]),
    );
    const [first, second] = model.floors[0].combats;
    expect(first.rolledBackByReload).toBe(true);
    expect(combatCounts(first)).toBe(false);
    expect(combatCounts(second)).toBe(true);
  });

  it("keeps the fight live when the turns carry on past the resume", () => {
    // The shape from a real journal: no combat_start after the resume, the
    // turn counter continues, and the continued turns carry no fight id.
    const model = parseReplay(
      journal([
        ...opening,
        { t: "turn", s: 5, floor: 21, act: 2, n: 7, side: "enemy", combat_id: "2.21:AXEBOT", attempt_id: 0 },
        { t: "resume", s: 6, floor: 21, act: 2, reloads: 1, hp: 26, gold: 100 },
        { t: "turn", s: 7, floor: 21, act: 2, n: 8, side: "player" },
        { t: "turn", s: 8, floor: 21, act: 2, n: 8, side: "enemy" },
      ]),
    );
    const [c] = model.floors[0].combats;
    expect(model.floors[0].combats).toHaveLength(1);
    expect(c.rolledBackByReload).toBe(false);
    expect(combatCounts(c)).toBe(true);
    expect(c.turns.map((x) => x.n)).toEqual([1, 7, 8, 8]);
    expect(c.resumedAcrossReload).toBe(true);
    expect(c.hpLossRecorded).toBeUndefined();
  });

  it("carries on inside the fight the resume names", () => {
    const model = parseReplay(
      journal([
        ...opening,
        { t: "resume", s: 5, floor: 21, act: 2, reloads: 1, hp: 26, gold: 100, combat_id: "2.21:AXEBOT" },
        { t: "turn", s: 6, floor: 21, act: 2, n: 2, side: "player", combat_id: "2.21:AXEBOT", attempt_id: 1 },
        { t: "combat_end", s: 7, floor: 21, act: 2, turns: 2, result: "victory", combat_id: "2.21:AXEBOT", attempt_id: 1 },
      ]),
    );
    const [c] = model.floors[0].combats;
    expect(model.floors[0].combats).toHaveLength(1);
    // The continuation carries the new session's attempt id; that is not a
    // different fight.
    expect(c.resumedAcrossReload).toBe(true);
    expect(c.endRecorded).toBe(true);
    expect(c.result).toBe("victory");
    expect(c.turns).toHaveLength(2);
  });

  it("lets a fresh start override the fight the resume names", () => {
    // The resume names the fight that was in progress when the reload landed.
    // That is true whether it then carried on or restarted, so a following
    // start of the same encounter still means restarted.
    const model = parseReplay(
      journal([
        ...opening,
        { t: "resume", s: 5, floor: 21, act: 2, reloads: 1, hp: 70, gold: 100, combat_id: "2.21:AXEBOT" },
        { t: "room", s: 6, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
        { t: "combat_start", s: 7, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT", attempt_id: 1 },
        { t: "turn", s: 8, floor: 21, act: 2, n: 1, side: "player", combat_id: "2.21:AXEBOT", attempt_id: 1 },
      ]),
    );
    const [first, second] = model.floors[0].combats;
    expect(model.floors[0].combats).toHaveLength(2);
    expect(first.rolledBackByReload).toBe(true);
    expect(first.resumedAcrossReload).toBe(false);
    expect(combatCounts(first)).toBe(false);
    expect(combatCounts(second)).toBe(true);
  });

  it("leaves a fight the resume neither restarted nor continued as unfinished, not undone", () => {
    const model = parseReplay(journal([...opening, { t: "resume", s: 5, floor: 21, act: 2, reloads: 1, hp: 70, gold: 100 }]));
    const [c] = model.floors[0].combats;
    expect(c.rolledBackByReload).toBe(false);
    expect(c.endRecorded).toBe(false);
  });

  it("does not read a different fight starting later on the floor as a restart", () => {
    // Version 1 shape, no fight ids anywhere: A is interrupted, the reload
    // lands inside it, A ends, then B starts on the same floor.
    const v1 = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 1, starting_deck: [] };
    const model = parseReplay(
      journal([
        v1,
        { t: "room", s: 1, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
        { t: "combat_start", s: 2, floor: 21, act: 2, encounter: "AXEBOT", enemies: [] },
        { t: "turn", s: 3, floor: 21, act: 2, n: 1, side: "player" },
        { t: "resume", s: 4, floor: 21, act: 2, reloads: 1, hp: 40, gold: 100 },
        { t: "combat_end", s: 5, floor: 21, act: 2, turns: 2 },
        { t: "combat_start", s: 6, floor: 21, act: 2, encounter: "CHOMPER", enemies: [] },
        { t: "combat_end", s: 7, floor: 21, act: 2, turns: 1 },
      ]),
    );
    const [a, b] = model.floors[0].combats;
    expect(model.floors[0].combats).toHaveLength(2);
    expect(a.rolledBackByReload).toBe(false);
    expect(a.endRecorded && b.endRecorded).toBe(true);
    expect(combatCounts(a) && combatCounts(b)).toBe(true);
  });

  it("reads a fresh start of the same encounter as the restart, even without fight ids", () => {
    const v1 = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 1, starting_deck: [] };
    const model = parseReplay(
      journal([
        v1,
        { t: "room", s: 1, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
        { t: "combat_start", s: 2, floor: 21, act: 2, encounter: "AXEBOT", enemies: [] },
        { t: "resume", s: 3, floor: 21, act: 2, reloads: 1, hp: 40, gold: 100 },
        { t: "room", s: 4, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
        { t: "combat_start", s: 5, floor: 21, act: 2, encounter: "AXEBOT", enemies: [] },
        { t: "combat_end", s: 6, floor: 21, act: 2, turns: 3 },
      ]),
    );
    const [first, second] = model.floors[0].combats;
    expect(first.rolledBackByReload).toBe(true);
    expect(combatCounts(second)).toBe(true);
  });

  it("does not touch an unfinished fight on an earlier floor", () => {
    const model = parseReplay(
      journal([
        header,
        { t: "room", s: 1, floor: 20, act: 2, kind: "combat", id: "CHOMPER" },
        { t: "combat_start", s: 2, floor: 20, act: 2, encounter: "CHOMPER", enemies: [], combat_id: "2.20:CHOMPER" },
        { t: "room", s: 3, floor: 21, act: 2, kind: "combat", id: "AXEBOT" },
        { t: "resume", s: 4, floor: 21, act: 2, reloads: 1, hp: 70, gold: 100 },
        { t: "combat_start", s: 5, floor: 21, act: 2, encounter: "AXEBOT", enemies: [], combat_id: "2.21:AXEBOT" },
      ]),
    );
    expect(model.floors[0].combats[0].rolledBackByReload).toBe(false);
  });
});

describe("the end line's hp is a latch or a sample, never a measurement", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const room = { t: "room", s: 1, floor: 17, act: 1, kind: "combat", id: "A" };

  it("keeps the last recorded hp when the run did not end in a death", () => {
    const model = parseReplay(journal([header, room, { t: "hp", s: 2, floor: 17, act: 1, hp: 0, d: -5 }, { t: "end", s: 3, terminal_reason: "left_run", is_game_over: false, hp: 14 }]));
    expect(model.floors[0].hpAfter).toBe(0);
  });

  it("takes the death latch over a sample that missed the killing blow", () => {
    const model = parseReplay(journal([header, room, { t: "hp", s: 2, floor: 17, act: 1, hp: 5, d: -3 }, { t: "end", s: 3, terminal_reason: "death", is_game_over: true, hp: 0 }]));
    expect(model.floors[0].hpAfter).toBe(0);
  });
});

describe("the journal saying its own capture was incomplete", () => {
  const base = [
    { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] },
    { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
  ];

  it("reads a complete capture as complete", () => {
    const model = parseReplay(journal([...base, { t: "end", s: 2, terminal_reason: "death", capture_status: "complete" }]));
    expect(captureIsComplete(model)).toBe(true);
  });

  it("carries a gapped capture and what it lost", () => {
    const model = parseReplay(
      journal([...base, { t: "end", s: 2, terminal_reason: "death", capture_status: "gapped", stop_reason: "queue_full", lost_from_seq: 44, lost_count: 17 }]),
    );
    expect(captureIsComplete(model)).toBe(false);
    expect(model.end?.stopReason).toBe("queue_full");
    expect(model.end?.lostFromSeq).toBe(44);
    expect(model.end?.lostCount).toBe(17);
  });

  it("carries a truncated capture", () => {
    const model = parseReplay(journal([...base, { t: "end", s: 2, terminal_reason: "death", capture_status: "truncated" }]));
    expect(captureIsComplete(model)).toBe(false);
    expect(model.end?.captureStatus).toBe("truncated");
  });

  it("says unknown rather than complete when the journal never stated it", () => {
    const model = parseReplay(journal([...base, { t: "end", s: 2, terminal_reason: "death" }]));
    expect(captureIsComplete(model)).toBeUndefined();
  });

  it("reads the status the repository journals actually carry", () => {
    for (const f of ["real-replay-coords.jsonl", "real-replay.jsonl", "real-replay-regent.jsonl", "sample-replay.jsonl"]) {
      const model = parseReplay(readFileSync(new URL(`../../backend/tests/fixtures/${f}`, import.meta.url), "utf-8"));
      expect(captureIsComplete(model)).toBe(true);
    }
  });
});

describe("a jump in the sequence locates exactly what the journal lost", () => {
  it("finds nothing in a contiguous journal", () => {
    for (const f of ["real-replay-coords.jsonl", "real-replay.jsonl", "real-replay-regent.jsonl", "sample-replay.jsonl"]) {
      const model = parseReplay(readFileSync(new URL(`../../backend/tests/fixtures/${f}`, import.meta.url), "utf-8"));
      expect(model.gaps).toEqual([]);
      expect(model.floors.every((fl) => fl.linesLost === 0)).toBe(true);
    }
  });

  it("reads a jump as exactly that many lost lines, on the floor it happened", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
        { t: "play", s: 2, floor: 1, act: 1, id: "STRIKE" },
        // s 3 through 6 were assigned to lines that never made it out.
        { t: "play", s: 7, floor: 1, act: 1, id: "DEFEND" },
        { t: "end", s: 8, terminal_reason: "death", capture_status: "gapped", stop_reason: "queue_full", lost_from_seq: 3, lost_count: 4 },
      ]),
    );
    expect(model.gaps).toEqual([{ afterSeq: 2, count: 4, floor: 1 }]);
    expect(model.floors[0].linesLost).toBe(4);
    expect(model.lostCountAgrees).toBe(true);
  });

  it("finds every scattered gap, not just the first the recorder named", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "room", s: 1, floor: 8, act: 1, kind: "combat", id: "A" },
        { t: "play", s: 4, floor: 8, act: 1, id: "STRIKE" },
        { t: "room", s: 5, floor: 30, act: 3, kind: "combat", id: "B" },
        { t: "play", s: 9, floor: 30, act: 3, id: "DEFEND" },
        { t: "end", s: 10, terminal_reason: "death", capture_status: "gapped", lost_from_seq: 2, lost_count: 5 },
      ]),
    );
    // lost_from_seq names only the first drop, so a viewer built on it alone
    // would have marked floor 8 and missed floor 30 entirely.
    expect(model.gaps.map((g) => [g.afterSeq, g.count, g.floor])).toEqual([[1, 2, 8], [5, 3, 30]]);
    expect(model.floors.map((f) => f.linesLost)).toEqual([2, 3]);
    expect(model.lostCountAgrees).toBe(true);
  });

  it("reports when the recorder's count disagrees with the sequence", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
        { t: "play", s: 4, floor: 1, act: 1, id: "STRIKE" },
        { t: "end", s: 5, terminal_reason: "death", capture_status: "gapped", lost_count: 99 },
      ]),
    );
    expect(model.lostCountAgrees).toBe(false);
  });

  it("leaves a truncated capture with no gaps to find, since the tail spent no sequence", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
        { t: "end", s: 2, terminal_reason: "quit", capture_status: "truncated", stop_reason: "writer_error" },
      ]),
    );
    expect(model.gaps).toEqual([]);
    // Only the status reveals it. A contiguous sequence is not proof of a
    // complete capture.
    expect(captureIsComplete(model)).toBe(false);
  });
});

describe("a resumed journal is one run, not several", () => {
  const v1 = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 1, seed: "SEED1", starting_deck: [] };
  const v2 = { t: "header", s: 244, ms: 1, floor: 5, act: 1, replay_version: 2, seed: "SEED1", starting_deck: [] };

  it("keeps the first header's identity and the last header's declared version", () => {
    const model = parseReplay(
      journal([
        v1,
        { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" },
        { t: "end", s: 243, terminal_reason: "left_run", is_game_over: false, hp: 75 },
        v2,
        { t: "resume", s: 245, floor: 1, act: 1, reloads: 1, hp: 75, gold: 10 },
      ]),
    );
    expect(model.header?.seed).toBe("SEED1");
    expect(model.header?.replayVersion).toBe(2);
  });

  it("re-enters the floor a reload put the player back on instead of listing it twice", () => {
    const model = parseReplay(
      journal([
        v1,
        { t: "room", s: 1, floor: 5, act: 1, kind: "combat", id: "SLIMES_WEAK", coord: "0,4" },
        { t: "hp", s: 2, floor: 5, act: 1, hp: 79, d: 0 },
        { t: "combat_start", s: 3, floor: 5, act: 1, encounter: "SLIMES_WEAK", enemies: [], combat_id: "1.5:SLIMES_WEAK", attempt_id: 0 },
        { t: "turn", s: 4, floor: 5, act: 1, n: 0, side: "player", combat_id: "1.5:SLIMES_WEAK", attempt_id: 0 },
        { t: "end", s: 243, terminal_reason: "left_run", is_game_over: false, hp: 75 },
        v2,
        { t: "resume", s: 245, floor: 5, act: 1, reloads: 1, hp: 79, gold: 124 },
        { t: "room", s: 246, floor: 5, act: 1, kind: "combat", id: "SLIMES_WEAK", coord: "0,4" },
        { t: "combat_start", s: 247, floor: 5, act: 1, encounter: "SLIMES_WEAK", enemies: [], combat_id: "1.5:SLIMES_WEAK", attempt_id: 1 },
        { t: "combat_end", s: 332, floor: 5, act: 1, turns: 3, result: "victory", combat_id: "1.5:SLIMES_WEAK", attempt_id: 1, hp_lost_total: 4 },
        { t: "end", s: 400, terminal_reason: "left_run", is_game_over: false, hp: 75 },
      ]),
    );
    expect(model.floors.map((f) => f.floor)).toEqual([5]);
    const [first, second] = model.floors[0].combats;
    expect(model.floors[0].combats).toHaveLength(2);
    expect(first.supersededByRetry && first.rolledBackByReload).toBe(true);
    expect(combatCounts(second)).toBe(true);
    expect(second.hpLost).toBe(4);
    // The run's outcome is the last end line, not the one a reload undid.
    expect(model.end?.terminalReason).toBe("left_run");
  });
});

describe("parseReplay on the version 2 journals", () => {
  const load = (f: string) => parseReplay(readFileSync(new URL(`../../backend/tests/fixtures/${f}`, import.meta.url), "utf-8"));
  const files = ["v2-full-run.jsonl", "v2-reload-and-death.jsonl", "v2-act3-map.jsonl"];

  it("lists every floor once, with a recorded position, all the way through", () => {
    for (const f of files) {
      const m = load(f);
      const keys = m.floors.map((x) => `${x.act}-${x.floor}`);
      expect(new Set(keys).size, f).toBe(keys.length);
      const route = [...new Set(m.floors.map((x) => x.act))].flatMap((a) => routeForAct(m, a));
      expect(route.every((e) => e.coord !== undefined && !e.offMap), f).toBe(true);
      expect(captureIsComplete(m), f).toBe(true);
      expect(m.gaps, f).toEqual([]);
    }
  });

  it("reads the recorder's own results and totals on every finished fight", () => {
    for (const f of files) {
      const m = load(f);
      const ended = m.floors.flatMap((x) => x.combats).filter((c) => c.endRecorded);
      expect(ended.length, f).toBeGreaterThan(0);
      expect(ended.every((c) => c.result === "victory" && c.hpLost !== undefined), f).toBe(true);
    }
  });

  it("gets the Ancient from the recorded map rather than inventing it", () => {
    // Act 3's boss and Ancient names in v2-full-run are wrong in the recording
    // itself: the recorder read a stale snapshot there, and has since been
    // fixed. The nodes and coordinates were right, so only those are checked.
    for (const f of files) {
      const m = load(f);
      for (const map of Object.values(m.maps)) {
        expect(map.nodes.some((n) => n[2] === "ancient"), `${f} act ${map.act}`).toBe(true);
      }
    }
  });

  it("survives a death that a reload took back", () => {
    const m = load("v2-reload-and-death.jsonl");
    expect(m.header?.replayVersion).toBe(2);
    expect(m.end?.terminalReason).toBe("left_run");
    expect(m.end?.isGameOver).toBe(false);
    // Floor 5 restarted after its reload, so that attempt is undone. Floor 17
    // resumed inside the boss fight and ran on to turn 11, so it stands.
    const undone = m.floors.flatMap((x) => x.combats).filter((c) => !combatCounts(c));
    expect(undone.map((c) => c.encounter)).toEqual(["SLIMES_WEAK"]);
    const boss = m.floors.find((f) => f.floor === 17)!.combats[0];
    expect(boss.encounter).toBe("VANTOM_BOSS");
    expect(combatCounts(boss)).toBe(true);
    expect(boss.resumedAcrossReload).toBe(true);
    expect(boss.turns.some((t) => t.n === 11)).toBe(true);
    // The last hp line says 0; the end line's 14 is a stale sample.
    expect(m.floors[m.floors.length - 1].hpAfter).toBe(0);
  });
});

describe("parseReplay on the version 2 shop journal", () => {
  const model = parseReplay(readFileSync(new URL("../../backend/tests/fixtures/v2-shop.jsonl", import.meta.url), "utf-8"));
  const shops = model.floors.flatMap((f) => f.lines).filter((l): l is ShopLine => l.t === "shop");
  const buys = model.floors.flatMap((f) => f.lines).filter((l): l is BuyLine => l.t === "buy");
  const stocked = (s: ShopLine) => [...s.cards, ...s.relics, ...s.potions].filter((i) => i.stocked).length;

  it("reads one shop line on entry and one after every purchase", () => {
    expect(shops).toHaveLength(12);
    expect(buys).toHaveLength(11);
    expect(shops.map(stocked)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 5, 4, 3]);
  });

  it("joins each purchase to a shelf slot of its kind, except the removal service", () => {
    for (const b of buys) {
      if (b.kind === "removal_service") {
        expect(b.slot).toBeUndefined();
        continue;
      }
      const shelf = b.kind === "card" ? shops[0].cards : b.kind === "relic" ? shops[0].relics : shops[0].potions;
      expect(shelf.some((i) => i.slot === b.slot && i.id === b.id), `${b.kind} slot ${b.slot}`).toBe(true);
    }
  });

  it("moves the removal flag rather than the shelves when the removal is bought", () => {
    const flips = shops.filter((s, i) => i > 0 && s.removalStocked !== shops[i - 1].removalStocked);
    expect(flips).toHaveLength(1);
    expect(shops[shops.length - 1].removalStocked).toBe(false);
  });

  it("walks the gold down by exactly each purchase", () => {
    // The entry line in this recording is stamped with the previous floor,
    // a recorder bug fixed after this file was captured, so nothing here
    // asserts which floor the entry line sits on.
    for (let i = 1; i < shops.length; i += 1) {
      expect((shops[i - 1].gold ?? 0) - (shops[i].gold ?? 0)).toBe(buys[i - 1].costCurrent);
    }
  });
});

describe("parseReplay on the quit-and-continue journal", () => {
  const model = parseReplay(readFileSync(new URL("../../backend/tests/fixtures/v2-quit-continue.jsonl", import.meta.url), "utf-8"));

  it("reads the journal reopening in the same process as a resume", () => {
    // The first recorder build dropped every line after an in-process quit
    // and Continue. This is the first journal where the tail exists at all.
    expect(model.resumes).toHaveLength(1);
    expect(model.resumes[0].floor).toBe(2);
    expect(model.resumes[0].combatId).toBe("1.2:SEAPUNK_WEAK");
    expect(model.gaps).toEqual([]);
  });

  it("counts the fight once, from the restart, under one id across the reload", () => {
    const floor = model.floors.find((f) => f.floor === 2)!;
    expect(floor.combats).toHaveLength(2);
    const [first, second] = floor.combats;
    expect(first.combatId).toBe(second.combatId);
    expect([first.attemptId, second.attemptId]).toEqual([0, 1]);
    expect(first.rolledBackByReload && first.supersededByRetry).toBe(true);
    expect(combatCounts(first)).toBe(false);
    expect(combatCounts(second)).toBe(true);
    expect(model.floors.map((f) => f.floor)).toEqual([1, 2]);
  });

  it("does not read the quit-to-menu boundary as the run's outcome", () => {
    // The game was closed rather than the run left, so the only end line in
    // the file is the boundary before the resume. The run has no recorded
    // outcome and no recorded capture status.
    expect(model.end).toBeUndefined();
    expect(captureIsComplete(model)).toBeUndefined();
  });
});

describe("an end line with journal behind it is a boundary, not the outcome", () => {
  const header = { t: "header", s: 0, ms: 1, floor: 0, act: 1, replay_version: 2, starting_deck: [] };
  const room = { t: "room", s: 1, floor: 1, act: 1, kind: "combat", id: "A" };

  it("takes the last end line when nothing follows it", () => {
    const model = parseReplay(journal([header, room, { t: "end", s: 2, terminal_reason: "left_run" }, header, { t: "resume", s: 4, floor: 1, act: 1, reloads: 1 }, { t: "end", s: 5, terminal_reason: "death", is_game_over: true, hp: 0 }]));
    expect(model.end?.terminalReason).toBe("death");
  });

  it("reports no outcome when the journal goes on past its last end line", () => {
    const model = parseReplay(journal([header, room, { t: "end", s: 2, terminal_reason: "left_run" }, header, { t: "resume", s: 4, floor: 1, act: 1, reloads: 1 }, { t: "play", s: 5, floor: 1, act: 1, id: "STRIKE" }]));
    expect(model.end).toBeUndefined();
  });
});

describe("a line stamped with a floor not seen yet belongs to that floor", () => {
  it("files the shop's stock under the merchant even though it arrives a beat early", () => {
    const model = parseReplay(
      journal([
        { t: "header", s: 0, replay_version: 2 },
        { t: "room", s: 1, floor: 2, act: 1, kind: "combat", id: "A" },
        { t: "shop", s: 2, floor: 3, act: 1, gold: 99, removal_stocked: true, cards: [{ slot: 0, id: "HEADBUTT", cost: 52, stocked: true }], relics: [], potions: [] },
        { t: "room", s: 3, floor: 3, act: 1, kind: "merchant" },
        { t: "buy", s: 4, floor: 3, act: 1, kind: "card", slot: 0, id: "HEADBUTT", cost_current: 52, cost_resource: "gold", gold_on_hand: 47 },
      ]),
    );
    expect(model.floors.map((f) => [f.floor, f.kind])).toEqual([[2, "combat"], [3, "merchant"]]);
    const merchant = model.floors[1];
    expect(merchant.shop?.gold).toBe(99);
    expect(model.floors[0].lines.some((l) => l.t === "shop")).toBe(false);
  });

  it("reads the recorder's fixed entry line on the real journal", () => {
    const model = parseReplay(readFileSync(new URL("../../backend/tests/fixtures/v2-shop-entry-floor.jsonl", import.meta.url), "utf-8"));
    expect(model.floors.map((f) => f.floor)).toEqual([1, 2, 3]);
    const merchant = model.floors[2];
    expect(merchant.kind).toBe("merchant");
    const stocked = (s: ShopLine) => [...s.cards, ...s.relics, ...s.potions].filter((i) => i.stocked).length;
    expect(merchant.shop && stocked(merchant.shop)).toBe(13);
    expect(merchant.shop?.gold).toBe(99);
    const shops = merchant.lines.filter((l): l is ShopLine => l.t === "shop");
    expect(shops.map(stocked)).toEqual([13, 12]);
    expect(captureIsComplete(model)).toBe(true);
  });
});
