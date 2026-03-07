const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  upgrade: Record<string, string | number | null> | null;
  image_url: string | null;
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

export interface Stats {
  cards: number;
  characters: number;
  relics: number;
  monsters: number;
  potions: number;
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
};
