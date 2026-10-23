import { describe, expect, it } from "vitest";
import { collectRunGameIds } from "./game-ids";
import { cleanRun } from "./util";
import type { RawRun } from "./types";

const raw: RawRun = {
  win: false,
  was_abandoned: false,
  is_beta: false,
  ascension: 5,
  acts: ["ACT.OVERGROWTH", "ACT.HIVE"],
  killed_by_encounter: "ENCOUNTER.AEONGLASS_BOSS",
  killed_by_event: "NONE.NONE",
  player_index: 0,
  players: [
    {
      character: "CHARACTER.IRONCLAD",
      deck: [
        { id: "CARD.STRIKE", floor_added_to_deck: 1 },
        {
          id: "CARD.WHIRLWIND",
          current_upgrade_level: 1,
          enchantment: { id: "ENCHANTMENT.ADROIT", amount: 2 },
          floor_added_to_deck: 4,
        },
      ],
      relics: [{ id: "RELIC.AKABEKO", floor_added_to_deck: 3 }],
      potions: [{ id: "POTION.AMBERGRIS", slot_index: 0 }],
    },
  ],
  map_point_history: [
    [
      {
        map_point_type: "monster",
        rooms: [
          {
            model_id: "ENCOUNTER.BOWLBUGS_WEAK",
            room_type: "monster",
            monster_ids: ["MONSTER.BOWLBUG", "MONSTER.BOWLBUG"],
            turns_taken: 3,
          },
        ],
        player_stats: [
          {
            current_hp: 70,
            max_hp: 80,
            card_choices: [
              { card: { id: "CARD.ANGER" }, was_picked: true },
              { card: { id: "CARD.CLEAVE" }, was_picked: false },
            ],
            potion_choices: [
              { choice: "POTION.FIRE_POTION", was_picked: true },
            ],
          },
        ],
      },
      {
        map_point_type: "event",
        rooms: [{ model_id: "EVENT.MORPHIC_GROVE", room_type: "event" }],
        player_stats: [
          {
            event_choices: [
              {
                title: {
                  key: "MORPHIC_GROVE.pages.INITIAL.options.LONER.title",
                  table: "events",
                },
              },
            ],
            cards_transformed: [
              {
                original_card: { id: "CARD.STRIKE" },
                final_card: { id: "CARD.METEOR_STRIKE" },
              },
            ],
          },
        ],
      },
      {
        map_point_type: "ancient",
        rooms: [{ model_id: "EVENT.NONUPEIPE", room_type: "event" }],
        player_stats: [
          {
            ancient_choice: [
              {
                TextKey: "RELIC.ANCHOR",
                title: { key: "ANCHOR", table: "relics" },
                was_chosen: true,
              },
              { title: { key: "RELIC.BAG_OF_MARBLES", table: "relics" } },
            ],
          },
        ],
      },
      {
        map_point_type: "rest_site",
        rooms: [{ room_type: "rest_site" }],
        player_stats: [
          {
            rest_site_choices: ["SMITH"],
            upgraded_cards: ["CARD.ANGER"],
            potion_used: ["POTION.AMBERGRIS"],
            relic_choices: [{ choice: "RELIC.ANCHOR", was_picked: false }],
          },
        ],
      },
    ],
  ],
};

describe("run normaliser and game-id collection", () => {
  const run = cleanRun(raw);

  it("strips prefixes and keeps the deck floors", () => {
    expect(run.players[0].character).toBe("IRONCLAD");
    expect(run.players[0].deck[1]).toEqual({
      id: "WHIRLWIND",
      current_upgrade_level: 1,
      enchantment: { id: "ADROIT", amount: 2 },
      floor_added_to_deck: 4,
    });
    expect(run.killed_by_encounter).toBe("AEONGLASS_BOSS");
    expect(run.killed_by_event).toBeUndefined();
    expect(run.acts).toEqual(["OVERGROWTH", "HIVE"]);
    const floors = run.floor_history[0];
    expect(floors[0].floor_type).toBe("ENCOUNTER");
    expect(floors[2].floor_type).toBe("ANCIENT");
    expect(floors[2].player_stats[0].ancient_choices).toEqual([
      { id: "ANCHOR", table: "relics", was_picked: true },
      { id: "BAG_OF_MARBLES", table: "relics", was_picked: false },
    ]);
    expect(floors[1].player_stats[0].event_choices).toEqual([
      {
        table: "events",
        path: "MORPHIC_GROVE.pages.INITIAL.options.LONER.title",
        event: "MORPHIC_GROVE",
        option: "LONER",
      },
    ]);
  });

  it("lists every name leaf the page can show, grouped by table", () => {
    expect(collectRunGameIds(run)).toEqual({
      acts: ["HIVE.title", "OVERGROWTH.title"],
      ancients: ["NONUPEIPE.title"],
      cards: [
        "ANGER.title",
        "CLEAVE.title",
        "METEOR_STRIKE.title",
        "STRIKE.title",
        "WHIRLWIND.title",
      ],
      characters: ["IRONCLAD.title"],
      enchantments: ["ADROIT.title"],
      encounters: ["AEONGLASS_BOSS.title", "BOWLBUGS_WEAK.title"],
      events: [
        "MORPHIC_GROVE.pages.INITIAL.options.LONER.title",
        "MORPHIC_GROVE.title",
        "NONUPEIPE.title",
      ],
      monsters: ["BOWLBUG.name"],
      potions: ["AMBERGRIS.title", "FIRE_POTION.title"],
      relics: ["AKABEKO.title", "ANCHOR.title", "BAG_OF_MARBLES.title"],
    });
  });
});
