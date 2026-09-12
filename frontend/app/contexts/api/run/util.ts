import {
  DeckCard,
  RunEnchantment,
  Player,
  RawRun,
  RunRelic,
  Run,
  RunPotion,
  MapPoint,
  Floor,
  RawRoom,
  RoomType,
  FloorType,
  EncounterType,
  Room,
  RawModifier,
  RawPlayerStats,
  PlayerStats,
  LocalizationKey,
  SimpleChoice,
  AncientChoice,
  RawAncientChoice,
  RawEventChoice,
  CardTransformation,
  EventChoice,
} from "./types";
export const cleanRun = (raw: RawRun): Run => ({
  win: raw.win,
  was_abandoned: raw.was_abandoned,
  killed_by_encounter:
    raw.killed_by_encounter === "NONE.NONE"
      ? undefined
      : raw.killed_by_encounter?.split(/^ENCOUNTER\./).at(-1),
  killed_by_event:
    raw.killed_by_event === "NONE.NONE"
      ? undefined
      : raw.killed_by_event?.split(/^EVENT\./).at(-1),
  ascension: raw.ascension ?? 0,
  start_time: raw.start_time,
  run_time: raw.run_time,
  seed: raw.seed,
  build_id: raw.build_id,
  is_beta: raw.is_beta,
  game_mode: raw.game_mode,
  username: raw.username,
  player_index: raw.player_index,
  primary_hash: raw.primary_hash,
  // todo: probably clean more things, like modifiers
  acts: raw.acts?.map(cleanAct) ?? [],
  modifiers: raw.modifiers?.map(cleanModifier) ?? [],
  floor_history: raw.map_point_history?.map((x) => x.map(cleanMapPoint)) ?? [],
  players: raw.players.map(cleanPlayer),
});

const cleanAct = (raw: string) => raw.split(/^ACT\./).at(-1)!;

const cleanPlayer = (raw: Player): Player => ({
  character: raw.character.split(/^CHARACTER\./).at(-1)!,
  deck: raw.deck.map(cleanCard),
  relics: raw.relics.map(cleanRelic),
  potions: raw.potions?.map(cleanPotion),
  max_potion_slot_count: raw.max_potion_slot_count,
});
const cleanCard = ({
  id,
  current_upgrade_level,
  enchantment,
}: DeckCard): DeckCard => ({
  id: id.split(/^CARD\./).at(-1)!,
  current_upgrade_level,
  enchantment: enchantment && cleanEnchantment(enchantment),
});
const cleanEnchantment = ({ id, amount }: RunEnchantment): RunEnchantment => ({
  id: id.split(/^ENCHANMENT\./).at(-1)!,
  amount,
});
const cleanRelic = ({ id, floor_added_to_deck }: RunRelic): RunRelic => ({
  id: id.split(/^RELIC\./).at(-1)!,
  floor_added_to_deck,
});

const cleanPotion = ({ id, slot_index }: RunPotion): RunPotion => ({
  id: id.split(/^POTION\./).at(-1)!,
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
    raw.card_choices?.map(({ card, was_picked }) => ({
      card: cleanCard(card),
      was_picked,
    })),
  ),
  cards_gained: onlyNonEmpty(raw.cards_gained?.map(cleanCard)),
  cards_removed: onlyNonEmpty(raw.cards_removed?.map(cleanCard)),
  upgraded_cards: onlyNonEmpty(
    raw.upgraded_cards?.map((raw) => raw.split(/^CARD\./).at(-1)!),
  ),
  rest_site_choices: onlyNonEmpty(raw.rest_site_choices),
  potion_used: onlyNonEmpty(
    raw.potion_used?.map((raw) => raw.split(/^POTION/).at(-1)!),
  ),
  relic_choices: onlyNonEmpty(
    raw.relic_choices?.map((raw) => cleanSimpleChoice(raw, /^RELIC\./)),
  ),
  potion_choices: onlyNonEmpty(
    raw.potion_choices?.map((raw) => cleanSimpleChoice(raw, /^POTION\./)),
  ),
  ancient_choices: onlyNonEmpty(raw.ancient_choices?.map(cleanAncientChoice)),
  event_choices: onlyNonEmpty(raw.event_choices?.map(cleanEventChoice)),
  cards_transformed: onlyNonEmpty(
    raw.cards_transformed?.map(cleanCardsTransformed),
  ),
});

const cleanSimpleChoice = (
  { choice, was_picked }: SimpleChoice,
  regex: RegExp,
): SimpleChoice => ({
  choice: choice.split(regex).at(-1)!,
  was_picked,
});
const cleanAncientChoice = ({
  title,
  was_chosen: was_picked,
}: RawAncientChoice): AncientChoice => ({
  key: cleanLocalizationKey(title),
  was_picked,
});
const cleanEventChoice = ({ title }: RawEventChoice): EventChoice => ({
  key: cleanLocalizationKey(title),
});
const cleanCardsTransformed = ({
  original_card,
  final_card,
}: CardTransformation): CardTransformation => ({
  original_card: cleanCard(original_card),
  final_card: cleanCard(final_card),
});

const cleanLocalizationKey = ({ key, table }: LocalizationKey): string =>
  `${table}.${key}`;

const cleanModifier = ({ id, props }: RawModifier): RawModifier => ({
  id: id.split(/^MODIFIER\./).at(1)!,
  props,
});

const cleanMapPoint = (raw: MapPoint): Floor => {
  return {
    was_unknown: raw.map_point_type === "unknown",
    floor_type: resolveFloorType(raw),
    raw_type: raw.map_point_type,
    rooms: raw.rooms?.map((raw) => cleanRoom(raw) ?? raw) ?? [],
    player_stats: raw.player_stats?.map(cleanStats) ?? [],
  };
};

const cleanRoom = (raw: RawRoom): Room | undefined => {
  const type = raw.room_type && resolveRoomType(raw.room_type);
  if (!type) {
    return undefined;
  }
  switch (type) {
    case "REST":
    case "TREASURE":
    case "MERCHANT":
      return { type };
    case "EVENT":
      if (raw.model_id === undefined) {
        return undefined;
      }
      return {
        type,
        id: raw.model_id.split(/^EVENT\./).at(-1)!,
      };
    case "ENCOUNTER": {
      const encounter_type = raw.room_type
        ? resolveEncounterType(raw.room_type)
        : undefined;
      if (
        encounter_type === undefined ||
        raw.model_id === undefined ||
        raw.monster_ids === undefined
      ) {
        return undefined;
      }
      return {
        type,
        encounter_type,
        id: raw.model_id.split(/^ENCOUNTER\./).at(-1)!,
        monsters: raw.monster_ids.map((raw) => raw.split(/^MONSTER\./).at(-1)!),
        turns_taken: raw.turns_taken ?? 0,
      };
    }
  }
};

const resolveEncounterType = (raw_type: string): EncounterType | undefined => {
  switch (raw_type) {
    case "monster":
      return "ENEMY";
    case "elite":
      return "ELITE";
    case "boss":
      return "BOSS";
  }
  return undefined;
};

const resolveRoomType = (raw_type: string): RoomType | undefined => {
  switch (raw_type) {
    case "rest_site":
      return "REST";
    case "monster":
    case "elite":
    case "boss":
      return "ENCOUNTER";
    case "event":
      return "EVENT";
    case "ancient":
      return "ANCIENT";
    case "shop":
      return "MERCHANT";
    case "treasure":
      return "TREASURE";
  }
};

const resolveFloorType = (mapPoint: MapPoint): FloorType | undefined => {
  switch (mapPoint.map_point_type) {
    case "ancient":
      return "ANCIENT";
    case "unknown": {
      const first_room_type = mapPoint.rooms?.[0].room_type;
      return first_room_type ? resolveRoomType(first_room_type) : undefined;
    }
  }
  return resolveRoomType(mapPoint.map_point_type);
};
