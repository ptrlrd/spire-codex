"use client";
import { Run } from "@/lib/api/run/types";
import {
  Act,
  Affliction,
  Achievement,
  Badge,
  Card,
  Character,
  Enchantment,
  Encounter,
  Intent,
  Keyword,
  Potion,
  Power,
  Relic,
  Orb,
  Monster,
  Ascension,
  Story,
  Modifier,
} from "@/lib/api/types";
import { createContext } from "react";

export const ActsContext = createContext<Record<string, Act> | undefined>(
  undefined,
);
export const AfflictionsContext = createContext<
  Record<string, Affliction> | undefined
>(undefined);
export const AscensionContext = createContext<
  Record<string, Ascension> | undefined
>(undefined);
export const AchievementsContext = createContext<
  Record<string, Achievement> | undefined
>(undefined);
export const BadgesContext = createContext<Record<string, Badge> | undefined>(
  undefined,
);
export const CardsContext = createContext<Record<string, Card> | undefined>(
  undefined,
);
export const CharactersContext = createContext<
  Record<string, Character> | undefined
>(undefined);
export const EnchantmentsContext = createContext<
  Record<string, Enchantment> | undefined
>(undefined);
export const EncountersContext = createContext<
  Record<string, Encounter> | undefined
>(undefined);
export const EventsContext = createContext<Record<string, Event> | undefined>(
  undefined,
);
export const IntentsContext = createContext<Record<string, Intent> | undefined>(
  undefined,
);
export const KeywordsContext = createContext<
  Record<string, Keyword> | undefined
>(undefined);
export const PotionsContext = createContext<Record<string, Potion> | undefined>(
  undefined,
);
export const PowersContext = createContext<Record<string, Power> | undefined>(
  undefined,
);
export const RelicsContext = createContext<Record<string, Relic> | undefined>(
  undefined,
);
export const StoriesContext = createContext<Record<string, Story> | undefined>(
  undefined,
);
export const OrbsContext = createContext<Record<string, Orb> | undefined>(
  undefined,
);
export const ModifiersContext = createContext<
  Record<string, Modifier> | undefined
>(undefined);
export const MonstersContext = createContext<
  Record<string, Monster> | undefined
>(undefined);

const SharedRunContext = createContext<Run | undefined>(undefined);
export default SharedRunContext;
