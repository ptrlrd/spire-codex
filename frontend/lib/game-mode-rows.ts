export interface GameModeEntry {
  id?: string | null;
  name: string;
  description: string;
}

export interface GameModeDominion {
  id: string;
  encounter_id?: string | null;
  boss_name: string;
  name: string;
  description: string;
}

export interface RarityOdds {
  common: number;
  uncommon: number;
  rare: number;
}

export interface GameModeOffer extends GameModeEntry {
  cursed?: boolean;
  rare?: boolean;
}

export interface GameModeNamed {
  id: string;
  name: string;
}

export interface GameModeRoom {
  type: string;
  name: string;
  easy?: boolean | null;
}

export interface GameModeReward {
  room: string;
  room_name: string;
  card_rarity: string;
  card_choices?: number | null;
  relics: number;
  potion?: "always" | "after_first_fight" | null;
  final_boss?: boolean;
}

export interface GameModeMerchant {
  offers_shown?: number;
  normal_offers_shown?: number;
  cursed_offers_shown?: number;
  picks?: number;
  rare_offer_weight?: number;
  card_rarity_odds?: RarityOdds;
  enchantments?: { id: string; name: string; amount: number }[];
  curses?: GameModeNamed[] | null;
}

export interface GameModeAscensionStep {
  level: number;
  id: string;
  name: string;
  description?: string | null;
}

export interface GameModeRow {
  id: string;
  name: string;
  description?: string | null;
  multiplayer_description?: string | null;
  intro?: string | null;
  rules?: string[] | null;
  epoch_id?: string | null;
  unlock_text?: string | null;
  unlock_info?: string | null;
  neow?: GameModeEntry | null;
  merchant_entries?: GameModeOffer[] | null;
  max_ascension?: number | null;
  act_rooms?: GameModeRoom[] | null;
  floors_per_act?: number | null;
  neow_details?: {
    cards_offered?: number;
    cards_picked?: number;
    rarity_odds?: RarityOdds;
  } | null;
  merchant?: GameModeMerchant | null;
  rewards?: GameModeReward[] | null;
  reward_upgrades_by_act?: number[] | null;
  treasure_extra_relics?: { singleplayer: number; multiplayer: number } | null;
  ascension_ladder?: GameModeAscensionStep[] | null;
  banned_cards?: GameModeNamed[] | null;
  banned_relics?: GameModeNamed[] | null;
  late_relics?: { from_floor: number; relics: GameModeNamed[] } | null;
  dominions?: GameModeDominion[] | null;
  rotating_streak?: GameModeEntry | null;
}

export function betaOnlyModeIds(
  main: GameModeRow[],
  shown: GameModeRow[],
): string[] {
  const inMain = new Set(main.map((m) => m.id));
  return shown.filter((m) => m.epoch_id && !inMain.has(m.id)).map((m) => m.id);
}

export function modeAnchor(id: string): string {
  return id.toLowerCase().replace(/_/g, "-");
}
