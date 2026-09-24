import {
  Achievement,
  Act,
  Affliction,
  Ascension,
  Badge,
  Card,
  Character,
  Enchantment,
  Encounter,
  Epoch,
  GameEvent,
  Intent,
  Keyword,
  Modifier,
  Monster,
  NewsArticle,
  NewsListResponse,
  Orb,
  Potion,
  Power,
  Relic,
  Stats,
  Story,
} from "@/lib/api/types";
import { RawRun } from "./run/types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export interface Endpoints {
  stats: Stats;
  news: NewsListResponse;
  [key: `news/${string}`]: NewsArticle;
  [key: `achievements/${string}`]: Achievement;
  achievements: Achievement[];
  [key: `acts/${string}`]: Act;
  acts: Act[];
  [key: `afflictions/${string}`]: Affliction;
  afflictions: Affliction[];
  [key: `acensions/${string}`]: Ascension;
  ascension: Ascension[];
  [key: `badges/${string}`]: Badge;
  badges: Badge[];
  [key: `cards/${string}`]: Card;
  cards: Card[];
  [key: `characters/${string}`]: Character;
  characters: Character[];
  [key: `epochs/${string}`]: Epoch;
  epochs: Epoch;
  [key: `enchantments/${string}`]: Enchantment;
  enchantments: Enchantment[];
  [key: `encounters/${string}`]: Encounter;
  encounters: Encounter[];
  [key: `events/${string}`]: GameEvent;
  events: GameEvent[];
  [key: `intents/${string}`]: Intent;
  intents: Intent[];
  [key: `keywords/${string}`]: Keyword;
  keywords: Keyword[];
  [key: `potions/${string}`]: Potion;
  potions: Potion[];
  [key: `powers/${string}`]: Power;
  powers: Power[];
  [key: `relics/${string}`]: Relic;
  relics: Relic[];
  [key: `runs/shared/${string}`]: RawRun;
  "runs/list": RawRun[];
  [key: `stories/${string}`]: Story;
  stories: Story[];
  [key: `orbs/${string}`]: Orb;
  orbs: Orb[];
  [key: `modifiers/${string}`]: Modifier;
  modifiers: Modifier[];
  [key: `monsters/${string}`]: Monster;
  monsters: Monster[];
}

export type IdMappableEndpointKeyTypes = {
  [K in keyof Endpoints]: Endpoints[K] extends { id: string }[] ? K : never;
}[keyof Endpoints];
