import type { DeckCard, Run } from "./types";

/** The leaf each table keeps a display name under. */
export const GAME_NAME_FIELD: Record<string, string> = {
  cards: "title",
  relics: "title",
  potions: "title",
  enchantments: "title",
  characters: "title",
  acts: "title",
  encounters: "title",
  events: "title",
  ancients: "title",
  monsters: "name",
};

/** Every game-table path a run page renders, grouped by table, as
 * "ID.title" style leaves ready for pickGameMessages. */
export function collectRunGameIds(run: Run): Record<string, string[]> {
  const sets: Record<string, Set<string>> = {};
  const addPath = (table: string, path: string) => {
    if (!(table in GAME_NAME_FIELD) || !path) return;
    (sets[table] ??= new Set()).add(path);
  };
  const add = (table: string, id?: string | null) => {
    if (id) addPath(table, `${id}.${GAME_NAME_FIELD[table]}`);
  };
  const addCard = (card?: DeckCard | null) => {
    if (!card?.id) return;
    add("cards", card.id);
    if (card.enchantment?.id) add("enchantments", card.enchantment.id);
  };

  for (const player of run.players) {
    add("characters", player.character);
    player.deck.forEach(addCard);
    for (const relic of player.relics) add("relics", relic.id);
    for (const potion of player.potions ?? []) add("potions", potion.id);
  }
  for (const act of run.acts) add("acts", act);
  add("encounters", run.killed_by_encounter);
  add("events", run.killed_by_event);

  for (const act of run.floor_history) {
    for (const floor of act) {
      for (const room of floor.rooms) {
        if (!("type" in room)) continue;
        if (room.type === "ENCOUNTER") {
          add("encounters", room.id);
          for (const monster of room.monsters) add("monsters", monster);
        } else if (room.type === "EVENT") {
          add("events", room.id);
          if (floor.floor_type === "ANCIENT") add("ancients", room.id);
        }
      }
      for (const ps of floor.player_stats) {
        ps.card_choices?.forEach((c) => addCard(c.card));
        ps.cards_gained?.forEach(addCard);
        ps.cards_removed?.forEach(addCard);
        ps.upgraded_cards?.forEach((id) => add("cards", id));
        ps.cards_transformed?.forEach((t) => {
          addCard(t.original_card);
          addCard(t.final_card);
        });
        ps.relic_choices?.forEach((c) => add("relics", c.choice));
        ps.potion_choices?.forEach((c) => add("potions", c.choice));
        ps.potion_used?.forEach((id) => add("potions", id));
        ps.ancient_choices?.forEach((c) => add(c.table, c.id));
        ps.event_choices?.forEach((c) => {
          add(c.table, c.event);
          if (c.option) addPath(c.table, c.path);
        });
      }
    }
  }

  return Object.fromEntries(
    Object.entries(sets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, ids]) => [table, [...ids].sort()]),
  );
}
