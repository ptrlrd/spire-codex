export interface DeckCard {
  id: string;
  current_upgrade_level?: number;
  enchantment?: { id: string; amount: number } | null;
}

export interface RunRelic {
  id: string;
  floor_added_to_deck?: number;
}

export interface LocalizationKey {
  key: string;
  table: string;
}

export interface PlayerStats {
  current_hp?: number;
  max_hp?: number;
  current_gold?: number;
  damage_taken?: number;
  hp_healed?: number;
  gold_gained?: number;
  gold_spent?: number;
  card_choices?: Array<{ card: { id: string }; was_picked: boolean }>;
  cards_gained?: Array<{ id: string }>;
  cards_removed?: Array<{ id: string }>;
  upgraded_cards?: string[];
  rest_site_choices?: string[];
  potion_used?: string[];
  relic_choices?: Array<{ choice: string; was_picked: boolean }>;
  ancient_choices?: Array<{ title?: LocalizationKey; was_chosen: boolean }>;
  event_choices?: Array<{ title?: LocalizationKey }>;
}

// todo: this can be improved to one of several distinct types
export interface Room {
  model_id?: string;
  room_type?: string;
  monster_ids?: string[];
  turns_taken?: number;
}

export interface MapPoint {
  map_point_type: string;
  rooms?: Room[];
  player_stats?: PlayerStats[];
}

export interface Player {
  character: string;
  deck: DeckCard[];
  relics: RunRelic[];
  potions?: { id: string; slot_index: number }[];
  max_potion_slot_count?: number;
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
  acts?: string[];
  start_time?: number;
  killed_by_encounter?: string;
  modifiers?: string[];
  map_point_history?: MapPoint[][];
  players: Player[];
  /** Attached server-side from the runs DB row (not in the on-disk
   *  run JSON). Missing for anonymous submissions. */
  username?: string;
  player_index: number;
  primary_hash?: string;
}
