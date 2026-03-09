const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface Card {
  id: string;
  name: string;
  description: string;
  description_raw: string | null;
  cost: number;
  is_x_cost: boolean | null;
  is_x_star_cost: boolean | null;
  star_cost: number | null;
  type: string;
  rarity: string;
  target: string;
  color: string;
  damage: number | null;
  block: number | null;
  hit_count: number | null;
  powers_applied: { power: string; amount: number }[] | null;
  cards_draw: number | null;
  energy_gain: number | null;
  hp_loss: number | null;
  keywords: string[] | null;
  tags: string[] | null;
  vars: Record<string, number> | null;
  upgrade: Record<string, string | number | null> | null;
  image_url: string | null;
  beta_image_url: string | null;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  starting_hp: number | null;
  starting_gold: number | null;
  max_energy: number | null;
  orb_slots: number | null;
  starting_deck: string[];
  starting_relics: string[];
  unlocks_after: string | null;
  gender: string | null;
  color: string | null;
  image_url: string | null;
}

export interface Relic {
  id: string;
  name: string;
  description: string;
  description_raw: string | null;
  flavor: string | null;
  rarity: string;
  pool: string;
  image_url: string | null;
}

export interface Monster {
  id: string;
  name: string;
  type: string;
  min_hp: number | null;
  max_hp: number | null;
  min_hp_ascension: number | null;
  max_hp_ascension: number | null;
  moves: { id: string; name: string }[] | null;
  damage_values: Record<string, { normal: number; ascension?: number }> | null;
  block_values: Record<string, number> | null;
  image_url: string | null;
}

export interface Potion {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_url: string | null;
}

export interface Enchantment {
  id: string;
  name: string;
  description: string;
  description_raw: string | null;
  extra_card_text: string | null;
  card_type: string | null;
  is_stackable: boolean;
  image_url: string | null;
}

export interface EncounterMonster {
  id: string;
  name: string;
}

export interface Encounter {
  id: string;
  name: string;
  room_type: string;
  is_weak: boolean;
  act: string | null;
  tags: string[] | null;
  monsters: EncounterMonster[] | null;
  loss_text: string | null;
}

export interface EventOption {
  id: string;
  title: string;
  description: string;
}

export interface EventPage {
  id: string;
  description: string | null;
  options: EventOption[] | null;
}

export interface DialogueLine {
  order: string;
  speaker: string;
  text: string;
}

export interface GameEvent {
  id: string;
  name: string;
  type: string;
  act: string | null;
  description: string | null;
  options: EventOption[] | null;
  pages: EventPage[] | null;
  epithet: string | null;
  dialogue: Record<string, DialogueLine[]> | null;
  image_url: string | null;
  relics: string[] | null;
}

export interface Power {
  id: string;
  name: string;
  description: string;
  description_raw: string | null;
  type: string;
  stack_type: string;
  allow_negative: boolean | null;
}

export interface Keyword {
  id: string;
  name: string;
  description: string;
}

export interface Intent {
  id: string;
  name: string;
  description: string;
}

export interface Orb {
  id: string;
  name: string;
  description: string;
  description_raw: string | null;
}

export interface Affliction {
  id: string;
  name: string;
  description: string;
  extra_card_text: string | null;
  is_stackable: boolean;
}

export interface Modifier {
  id: string;
  name: string;
  description: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
}

export interface Epoch {
  id: string;
  title: string;
  description: string | null;
  era: string;
  era_position: number;
  sort_order: number;
  story_id: string | null;
  unlock_info: string | null;
  unlock_text: string | null;
  unlocks_cards: string[] | null;
  unlocks_relics: string[] | null;
  unlocks_potions: string[] | null;
  expands_timeline: string[] | null;
}

export interface Story {
  id: string;
  name: string;
  epochs: string[];
}

export interface Stats {
  cards: number;
  characters: number;
  relics: number;
  monsters: number;
  potions: number;
  enchantments: number;
  encounters: number;
  events: number;
  powers: number;
  keywords: number;
  intents: number;
  orbs: number;
  afflictions: number;
  modifiers: number;
  achievements: number;
  epochs: number;
}

export const api = {
  getStats: () => fetchApi<Stats>("/api/stats"),
  getCards: (params?: string) => fetchApi<Card[]>(`/api/cards${params ? `?${params}` : ""}`),
  getCard: (id: string) => fetchApi<Card>(`/api/cards/${id}`),
  getCharacters: () => fetchApi<Character[]>("/api/characters"),
  getCharacter: (id: string) => fetchApi<Character>(`/api/characters/${id}`),
  getRelics: (params?: string) => fetchApi<Relic[]>(`/api/relics${params ? `?${params}` : ""}`),
  getRelic: (id: string) => fetchApi<Relic>(`/api/relics/${id}`),
  getMonsters: (params?: string) => fetchApi<Monster[]>(`/api/monsters${params ? `?${params}` : ""}`),
  getMonster: (id: string) => fetchApi<Monster>(`/api/monsters/${id}`),
  getPotions: (params?: string) => fetchApi<Potion[]>(`/api/potions${params ? `?${params}` : ""}`),
  getPotion: (id: string) => fetchApi<Potion>(`/api/potions/${id}`),
  getEnchantments: (params?: string) => fetchApi<Enchantment[]>(`/api/enchantments${params ? `?${params}` : ""}`),
  getEnchantment: (id: string) => fetchApi<Enchantment>(`/api/enchantments/${id}`),
  getEncounters: (params?: string) => fetchApi<Encounter[]>(`/api/encounters${params ? `?${params}` : ""}`),
  getEncounter: (id: string) => fetchApi<Encounter>(`/api/encounters/${id}`),
  getEvents: (params?: string) => fetchApi<GameEvent[]>(`/api/events${params ? `?${params}` : ""}`),
  getEvent: (id: string) => fetchApi<GameEvent>(`/api/events/${id}`),
  getPowers: (params?: string) => fetchApi<Power[]>(`/api/powers${params ? `?${params}` : ""}`),
  getPower: (id: string) => fetchApi<Power>(`/api/powers/${id}`),
  getKeywords: () => fetchApi<Keyword[]>("/api/keywords"),
  getIntents: () => fetchApi<Intent[]>("/api/intents"),
  getOrbs: () => fetchApi<Orb[]>("/api/orbs"),
  getAfflictions: () => fetchApi<Affliction[]>("/api/afflictions"),
  getModifiers: () => fetchApi<Modifier[]>("/api/modifiers"),
  getAchievements: () => fetchApi<Achievement[]>("/api/achievements"),
  getEpochs: (params?: string) => fetchApi<Epoch[]>(`/api/epochs${params ? `?${params}` : ""}`),
  getEpoch: (id: string) => fetchApi<Epoch>(`/api/epochs/${id}`),
  getStories: () => fetchApi<Story[]>("/api/stories"),
  getStory: (id: string) => fetchApi<Story>(`/api/stories/${id}`),
};
