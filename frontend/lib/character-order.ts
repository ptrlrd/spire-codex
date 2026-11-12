export const CHARACTER_ORDER = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "fool",
] as const;

export type CharacterId = (typeof CHARACTER_ORDER)[number];

export const CHARACTER_LABELS: Record<CharacterId, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
  fool: "Fool",
};

export const CHARACTER_IDS: readonly string[] = CHARACTER_ORDER;
export const CHARACTER_IDS_UPPER: readonly string[] = CHARACTER_ORDER.map((c) =>
  c.toUpperCase(),
);

export function characterKey(id: string | null | undefined): string {
  return (id ?? "").toLowerCase().replace(/^character\./, "");
}

export function isCharacter(id: string | null | undefined): boolean {
  return CHARACTER_IDS.includes(characterKey(id));
}

export const LAUNCH_CHARACTERS: readonly string[] = CHARACTER_ORDER.slice(0, 5);

/** A character added after launch can exist only in the beta catalog, so
 * lists filtered to it ask for the merged main plus beta catalog. */
export function needsMergedCatalog(id: string | null | undefined): boolean {
  const key = characterKey(id);
  return CHARACTER_IDS.includes(key) && !LAUNCH_CHARACTERS.includes(key);
}

export function characterLabel(id: string | null | undefined): string {
  const key = characterKey(id);
  return (
    (CHARACTER_LABELS as Record<string, string>)[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

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
