export const CHARACTER_ORDER = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
] as const;

export function characterRank(id: string): number {
  const key = id.toLowerCase().replace(/^character\./, "");
  const at = (CHARACTER_ORDER as readonly string[]).indexOf(key);
  return at < 0 ? CHARACTER_ORDER.length : at;
}

export function inCharacterOrder<T>(
  items: T[],
  idOf: (item: T) => string,
): T[] {
  return items
    .map((item, i) => ({ item, i, rank: characterRank(idOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.item);
}
