export interface DeckCard {
  id: string;
  current_upgrade_level?: number;
  enchantment?: RunEnchantment | null;
}

export interface RunEnchantment {
  id: string;
  amount: number;
}

export interface RunRelic {
  id: string;
  floor_added_to_deck?: number;
}

export interface LocalizationKey {
  key: string;
  table: string;
}

export interface SimpleChoice {
  choice: string;
  was_picked: boolean;
}

export interface CardTransformation {
  final_card: DeckCard;
  original_card: DeckCard;
}

export interface RawAncientChoice {
  TextKey: string;
  title: LocalizationKey;
  was_chosen: boolean;
}

export interface EventVariable {
  type: "DynamicString" | "BaseDynamic";
  decimal_value: number;
  bool_value: boolean;
  string_value: string;
}
export interface RawEventChoice {
  title: LocalizationKey;
  variables?: Record<string, EventVariable>;
}

// note: this could very easily be wrong/incomplete; mainly cleaning the id for now, haven't investigated the props.
export interface RawModifier {
  id: string;
  props: Record<string, { name: string; value: string }[]>;
}

export interface RawPlayerStats {
  current_hp?: number;
  hp_healed?: number;
  hp_lost?: number;
  max_hp?: number;
  max_hp_gained?: number;
  max_hp_lost?: number;
  current_gold?: number;
  damage_taken?: number;
  gold_gained?: number;
  gold_lost?: number;
  gold_spent?: number;
  stolen_loot?: number;
  card_choices?: Array<{ card: DeckCard; was_picked: boolean }>;
  cards_gained?: Array<DeckCard>;
  cards_removed?: Array<DeckCard>;
  upgraded_cards?: string[];
  rest_site_choices?: string[];
  potion_used?: string[];
  relic_choices?: Array<SimpleChoice>;
  potion_choices?: Array<SimpleChoice>;
  ancient_choices?: Array<RawAncientChoice>;
  event_choices?: Array<RawEventChoice>;
  cards_transformed?: Array<CardTransformation>;
}

// todo: this can be improved to one of several distinct types
export interface RawRoom {
  model_id?: string;
  room_type?: string;
  monster_ids?: string[];
  turns_taken?: number;
}

export interface MapPoint {
  map_point_type: string;
  rooms?: RawRoom[];
  player_stats?: RawPlayerStats[];
}

export interface Player {
  character: string;
  deck: DeckCard[];
  relics: RunRelic[];
  potions?: { id: string; slot_index: number }[];
  max_potion_slot_count?: number;
}

export interface RawRun {
  win: boolean;
  was_abandoned: boolean;
  ascension?: number;
  run_time?: number;
  seed?: string;
  build_id?: string;
  is_beta: boolean;
  game_mode?: string;
  acts?: string[];
  start_time?: number;
  killed_by_encounter?: string;
  killed_by_event?: string;
  modifiers?: RawModifier[];
  map_point_history?: MapPoint[][];
  players: Player[];
  /** Attached server-side from the runs DB row (not in the on-disk
   *  run JSON). Missing for anonymous submissions. */
  username?: string;
  player_index: number;
  primary_hash?: string;
}

export type EncounterType = "BOSS" | "ELITE" | "ENEMY";

export type RoomType = "ENCOUNTER" | "EVENT" | "MERCHANT" | "REST" | "TREASURE";

export type FloorType = RoomType | "ANCIENT";

export interface Floor {
  was_unknown: boolean;
  // not quite the same as all the possible room types, but overlapping
  floor_type?: FloorType; //omitted if not recognised due to being a mod etc
  raw_type: string; // use if floor type is ommitted
  rooms: (Room | RawRoom)[];
  player_stats: PlayerStats[];
}

export type Room = Encounter | Event | Treasure | RestSite | Merchant;

export interface Encounter {
  type: "ENCOUNTER";
  encounter_type: EncounterType;
  id: string;
  monsters: string[];
  turns_taken: number;
}

export interface Event {
  type: "EVENT";
  id: string;
}

export interface Merchant {
  type: "MERCHANT";
}

export interface Treasure {
  type: "TREASURE";
}

export interface RestSite {
  type: "REST";
}

export interface AncientChoice {
  key: string;
  was_picked: boolean;
}

export interface EventChoice {
  key: string;
  // variables: Record<string, EventVariable>; // I didn't include this since our game data doesn't support variables yet anyway
}

export interface PlayerStats {
  current_hp?: number;
  hp_healed?: number;
  hp_lost?: number;
  max_hp?: number;
  max_hp_gained?: number;
  max_hp_lost?: number;
  current_gold?: number;
  damage_taken?: number;
  gold_gained?: number;
  gold_lost?: number;
  gold_spent?: number;
  stolen_loot?: number;
  card_choices?: Array<{ card: DeckCard; was_picked: boolean }>;
  cards_gained?: Array<DeckCard>;
  cards_removed?: Array<DeckCard>;
  upgraded_cards?: string[];
  rest_site_choices?: string[];
  potion_used?: string[];
  relic_choices?: Array<SimpleChoice>;
  potion_choices?: Array<SimpleChoice>;
  ancient_choices?: Array<AncientChoice>;
  event_choices?: Array<EventChoice>;
  cards_transformed?: Array<CardTransformation>;
}

export interface Run {
  win: boolean;
  was_abandoned: boolean;
  ascension?: number;
  run_time?: number;
  seed?: string;
  build_id?: string;
  is_beta: boolean;
  game_mode?: string;
  acts: string[];
  start_time?: number;
  killed_by_encounter?: string;
  killed_by_event?: string;
  modifiers: RawModifier[]; // yes I think this needs to be an array in that I think some might be repeatable with different props.
  floor_history: Floor[][];
  players: Player[];
  /** Attached server-side from the runs DB row (not in the on-disk
   *  run JSON). Missing for anonymous submissions. */
  username?: string;
  player_index: number;
  primary_hash?: string;
}

export interface RunPotion {
  id: string;
  slot_index: number;
}
