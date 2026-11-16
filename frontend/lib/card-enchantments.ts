// Lookups over the card->enchantments render manifest. Imported server-side
// (the ~95KB map never ships to the client; pages pass only the slice they
// need). The manifest is the authoritative valid card x enchantment set from
// the render export.
import manifest from "./card-enchantments.json";

const MANIFEST = manifest as Record<string, string[]>;

/** Enchantment ids a card can take (lowercase), or [] if none. */
export function enchantmentsForCard(cardId: string): string[] {
  return MANIFEST[cardId.toLowerCase()] ?? [];
}

/** How many cards can take an enchantment. */
export function cardsForEnchantment(enchId: string): {
  total: number;
} {
  const ench = enchId.toLowerCase();
  let total = 0;
  for (const enchs of Object.values(MANIFEST)) {
    if (enchs.includes(ench)) total += 1;
  }
  return { total };
}
