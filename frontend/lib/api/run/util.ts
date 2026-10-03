import {
  AncientChoice,
  CardTransformation,
  DeckCard,
  EncounterType,
  EventChoice,
  Floor,
  FloorType,
  MapPoint,
  Player,
  PlayerStats,
  RawAncientChoice,
  RawEventChoice,
  RawModifier,
  RawPlayerStats,
  RawRoom,
  RawRun,
  Room,
  RoomType,
  Run,
  RunEnchantment,
  RunPotion,
  RunRelic,
  SimpleChoice,
} from "./types";

const strip = (raw: string, prefix: string) =>
  raw.startsWith(`${prefix}.`) ? raw.slice(prefix.length + 1) : raw;

const stripAny = (raw: string) => raw.replace(/^[A-Z_]+\./, "");

const none = (raw?: string) =>
  !raw || raw === "NONE.NONE" || raw === "NONE" ? undefined : raw;

export const cleanRun = (raw: RawRun): Run => ({
  win: !!raw.win,
  was_abandoned: !!raw.was_abandoned,
  killed_by_encounter: none(raw.killed_by_encounter)
    ? strip(raw.killed_by_encounter!, "ENCOUNTER")
    : undefined,
  killed_by_event: none(raw.killed_by_event)
    ? strip(raw.killed_by_event!, "EVENT")
    : undefined,
  ascension: raw.ascension ?? 0,
  start_time: raw.start_time,
  run_time: raw.run_time,
  seed: raw.seed,
  build_id: raw.build_id,
  is_beta: !!raw.is_beta,
  game_mode: raw.game_mode,
  username: raw.username ?? undefined,
  player_index: raw.player_index ?? 0,
  primary_hash: raw.primary_hash,
  has_replay: raw.has_replay,
  hidden: raw.hidden,
  acts: raw.acts?.map((a) => strip(a, "ACT")) ?? [],
  modifiers: raw.modifiers?.map(cleanModifier) ?? [],
  floor_history:
    raw.map_point_history?.map((act) => act.map(cleanMapPoint)) ?? [],
  players: (raw.players ?? []).map(cleanPlayer),
});

const cleanPlayer = (raw: Player): Player => ({
  character: strip(raw.character ?? "", "CHARACTER"),
  deck: (raw.deck ?? []).map(cleanCard),
  relics: (raw.relics ?? []).map(cleanRelic),
  potions: raw.potions?.map(cleanPotion),
  max_potion_slot_count: raw.max_potion_slot_count,
});

const cleanCard = ({
  id,
  current_upgrade_level,
  enchantment,
  floor_added_to_deck,
}: DeckCard): DeckCard => ({
  id: strip(id, "CARD"),
  current_upgrade_level,
  enchantment: enchantment ? cleanEnchantment(enchantment) : undefined,
  floor_added_to_deck:
    typeof floor_added_to_deck === "number" ? floor_added_to_deck : undefined,
});

const cleanEnchantment = ({ id, amount }: RunEnchantment): RunEnchantment => ({
  id: strip(id, "ENCHANTMENT"),
  amount,
});

const cleanRelic = ({ id, floor_added_to_deck }: RunRelic): RunRelic => ({
  id: strip(id, "RELIC"),
  floor_added_to_deck,
});

const cleanPotion = ({ id, slot_index }: RunPotion): RunPotion => ({
  id: strip(id, "POTION"),
  slot_index,
});

const onlyNonEmpty = <T>(items?: T[]): T[] | undefined =>
  items && items.length > 0 ? items : undefined;

const cleanStats = (raw: RawPlayerStats): PlayerStats => ({
  current_hp: raw.current_hp,
  hp_healed: raw.hp_healed,
  hp_lost: raw.hp_lost,
  max_hp: raw.max_hp,
  max_hp_gained: raw.max_hp_gained,
  max_hp_lost: raw.max_hp_lost,
  current_gold: raw.current_gold,
  damage_taken: raw.damage_taken,
  gold_gained: raw.gold_gained,
  gold_lost: raw.gold_lost,
  gold_spent: raw.gold_spent,
  stolen_loot: raw.stolen_loot,
  card_choices: onlyNonEmpty(
    raw.card_choices
      ?.filter((c) => c?.card?.id)
      .map(({ card, was_picked }) => ({
        card: cleanCard(card),
        was_picked: !!was_picked,
      })),
  ),
  cards_gained: onlyNonEmpty(raw.cards_gained?.map(cleanCard)),
  cards_removed: onlyNonEmpty(raw.cards_removed?.map(cleanCard)),
  upgraded_cards: onlyNonEmpty(
    raw.upgraded_cards?.map((id) => strip(id, "CARD")),
  ),
  rest_site_choices: onlyNonEmpty(raw.rest_site_choices?.filter(Boolean)),
  potion_used: onlyNonEmpty(raw.potion_used?.map((id) => strip(id, "POTION"))),
  relic_choices: onlyNonEmpty(
    raw.relic_choices?.map((c) => cleanSimpleChoice(c, "RELIC")),
  ),
  potion_choices: onlyNonEmpty(
    raw.potion_choices?.map((c) => cleanSimpleChoice(c, "POTION")),
  ),
  ancient_choices: onlyNonEmpty(
    (raw.ancient_choice ?? raw.ancient_choices)
      ?.map(cleanAncientChoice)
      .filter((c): c is AncientChoice => c !== undefined),
  ),
  event_choices: onlyNonEmpty(
    raw.event_choices
      ?.map(cleanEventChoice)
      .filter((c): c is EventChoice => c !== undefined),
  ),
  cards_transformed: onlyNonEmpty(
    raw.cards_transformed
      ?.filter((t) => t?.original_card?.id && t?.final_card?.id)
      .map(cleanCardsTransformed),
  ),
});

const cleanSimpleChoice = (
  { choice, was_picked }: SimpleChoice,
  prefix: string,
): SimpleChoice => ({
  choice: strip(choice ?? "", prefix),
  was_picked: !!was_picked,
});

const cleanAncientChoice = (
  raw: RawAncientChoice,
): AncientChoice | undefined => {
  const id = raw.TextKey || stripAny(raw.title?.key ?? "");
  if (!id) return undefined;
  return {
    id: stripAny(id),
    table: raw.title?.table || "relics",
    was_picked: !!raw.was_chosen,
  };
};

const optionOf = (path: string): string | undefined => {
  const parts = path.split(".");
  const i = parts.indexOf("options");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : undefined;
};

const cleanEventChoice = (raw: RawEventChoice): EventChoice | undefined => {
  const path = raw.title?.key;
  if (!path) return undefined;
  return {
    table: raw.title?.table || "events",
    path,
    event: path.split(".")[0],
    option: optionOf(path),
  };
};

const cleanCardsTransformed = ({
  original_card,
  final_card,
}: CardTransformation): CardTransformation => ({
  original_card: cleanCard(original_card),
  final_card: cleanCard(final_card),
});

const cleanModifier = ({ id, props }: RawModifier): RawModifier => ({
  id: strip(id ?? "", "MODIFIER"),
  props,
});

const cleanMapPoint = (raw: MapPoint): Floor => ({
  was_unknown: raw.map_point_type === "unknown",
  floor_type: resolveFloorType(raw),
  raw_type: raw.map_point_type,
  rooms: raw.rooms?.map((room) => cleanRoom(room) ?? room) ?? [],
  player_stats: raw.player_stats?.map(cleanStats) ?? [],
});

const cleanRoom = (raw: RawRoom): Room | undefined => {
  const type = raw.room_type ? resolveRoomType(raw.room_type) : undefined;
  if (!type) return undefined;
  switch (type) {
    case "REST":
    case "TREASURE":
    case "MERCHANT":
      return { type };
    case "EVENT":
      if (!raw.model_id) return undefined;
      return { type, id: strip(raw.model_id, "EVENT") };
    case "ENCOUNTER": {
      const encounter_type = raw.room_type
        ? resolveEncounterType(raw.room_type)
        : undefined;
      if (!encounter_type || !raw.model_id) return undefined;
      return {
        type,
        encounter_type,
        id: strip(raw.model_id, "ENCOUNTER"),
        monsters: (raw.monster_ids ?? []).map((m) => strip(m, "MONSTER")),
        turns_taken: raw.turns_taken ?? 0,
      };
    }
  }
};

const resolveEncounterType = (raw: string): EncounterType | undefined => {
  switch (raw) {
    case "monster":
      return "ENEMY";
    case "elite":
      return "ELITE";
    case "boss":
      return "BOSS";
  }
  return undefined;
};

const resolveRoomType = (raw: string): RoomType | undefined => {
  switch (raw) {
    case "rest_site":
    case "rest":
      return "REST";
    case "monster":
    case "elite":
    case "boss":
      return "ENCOUNTER";
    case "event":
      return "EVENT";
    case "shop":
    case "merchant":
      return "MERCHANT";
    case "treasure":
      return "TREASURE";
  }
  return undefined;
};

const resolveFloorType = (mapPoint: MapPoint): FloorType | undefined => {
  switch (mapPoint.map_point_type) {
    case "ancient":
      return "ANCIENT";
    case "unknown": {
      const first = mapPoint.rooms?.[0]?.room_type;
      return first ? resolveRoomType(first) : undefined;
    }
  }
  return resolveRoomType(mapPoint.map_point_type);
};
