import { DeckCard } from "@/lib/api/run/types";
import { CardsContext } from "@/app/contexts/api";
import { useContext } from "react";
import { useTryGameTranslations } from "./i18n";
import { Card } from "./api/types";

export interface StackEntry {
  id: string;
  upgraded: boolean;
  enchantment?: string;
  count: number;
  /** Earliest floor a copy in this stack joined the deck; absent on runs
   * recorded before the game wrote it. */
  floor?: number;
  first: number;
}

const rarityScore: Record<string, number> = {
  Rare: 5,
  Uncommon: 4,
  Common: 3,
  Starter: 1,
  Curse: 0,
  Status: 0,
};

export function stackCards(
  deck: DeckCard[],
  cards: Record<string, Card>,
  tryGT: ReturnType<typeof useTryGameTranslations>,
): StackEntry[] {
  const map = new Map<string, StackEntry>();
  for (const [index, card] of deck.entries()) {
    const id = card.id;
    const upgraded = !!card.current_upgrade_level;
    const enchantment = card.enchantment?.id;
    const floor = card.floor_added_to_deck;
    const key = `${id}::${upgraded}::${enchantment ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (
        (floor ?? Number.MAX_SAFE_INTEGER) <
        (existing?.floor ?? Number.POSITIVE_INFINITY)
      ) {
        existing.floor = floor;
      }
    } else {
      map.set(key, {
        id,
        upgraded,
        enchantment,
        count: 1,
        floor,
        first: index,
      });
    }
  }
  const stacks = [...map.values()];
  if (stacks.every((s) => s.floor !== undefined)) {
    return stacks.sort((a, b) => a.floor! - b.floor! || a.first - b.first);
  }
  return stacks.sort((a, b) => {
    const rarityA = cards?.[a.id]?.rarity;
    const rarityB = cards?.[b.id]?.rarity;
    const scoreA = rarityA ? rarityScore[rarityA] : 2;
    const scoreB = rarityB ? rarityScore[rarityB] : 2;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return (tryGT(`cards.${a.id}.title`) ?? a.id).localeCompare(
      tryGT(`cards.${a.id}.title`) ?? b.id,
    );
  });
}
