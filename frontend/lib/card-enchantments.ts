// Lookups over the card->enchantments render manifest. Imported server-side
// (the ~95KB map never ships to the client; pages pass only the slice they
// need). The manifest is the authoritative valid card x enchantment set from
// the render export.
import manifest from "./card-enchantments.json";

const MANIFEST = manifest as Record<string, string[]>;

// How many example cards an enchantment page shows.
const CARD_SAMPLE = 48;

/** Enchantment ids a card can take (lowercase), or [] if none. */
export function enchantmentsForCard(cardId: string): string[] {
  return MANIFEST[cardId.toLowerCase()] ?? [];
}

/** Cards that can take an enchantment: a capped, sorted sample + the total. */
export function cardsForEnchantment(enchId: string): { cardIds: string[]; total: number } {
  const ench = enchId.toLowerCase();
  const all: string[] = [];
  for (const [cardId, enchs] of Object.entries(MANIFEST)) {
    if (enchs.includes(ench)) all.push(cardId);
  }
  all.sort();
  return { cardIds: all.slice(0, CARD_SAMPLE), total: all.length };
}
