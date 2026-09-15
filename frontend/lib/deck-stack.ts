import { cleanId } from "@/lib/display-name";

export interface StackableCard {
  id: string;
  current_upgrade_level?: number;
  enchantment?: { id: string; amount: number } | null;
  floor_added_to_deck?: number;
}

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

/** Stacks identical cards and orders the stacks the way the deck was built:
 * starters first, then each pick in the order it joined the deck. Runs that
 * never recorded the floor fall back to rarity, then name. */
export function stackCards(
  deck: StackableCard[],
  cardData: Record<string, { rarity?: string; name?: string }>,
): StackEntry[] {
  const map = new Map<string, StackEntry>();
  deck.forEach((card, index) => {
    const id = cleanId(card.id);
    const upgraded = !!card.current_upgrade_level;
    const enchantment = card.enchantment
      ? cleanId(card.enchantment.id)
      : undefined;
    const floor =
      typeof card.floor_added_to_deck === "number"
        ? card.floor_added_to_deck
        : undefined;
    const key = `${id}::${upgraded}::${enchantment ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (
        floor !== undefined &&
        (existing.floor === undefined || floor < existing.floor)
      )
        existing.floor = floor;
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
  });
  const stacks = [...map.values()];
  if (stacks.every((s) => s.floor !== undefined)) {
    return stacks.sort(
      (a, b) => (a.floor as number) - (b.floor as number) || a.first - b.first,
    );
  }
  const rarityScore: Record<string, number> = {
    Rare: 5,
    Uncommon: 4,
    Common: 3,
    Starter: 1,
    Curse: 0,
    Status: 0,
  };
  return stacks.sort((a, b) => {
    const ra = rarityScore[cardData[a.id]?.rarity ?? ""] ?? 2;
    const rb = rarityScore[cardData[b.id]?.rarity ?? ""] ?? 2;
    if (ra !== rb) return rb - ra;
    return (cardData[a.id]?.name ?? a.id).localeCompare(
      cardData[b.id]?.name ?? b.id,
    );
  });
}
