import type { TFn } from "./i18n";

export const COMPARE_CHARACTERS = [
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
  "fool",
];

export function isCompareCharacter(id: string | null | undefined): boolean {
  return COMPARE_CHARACTERS.includes((id ?? "").toLowerCase());
}

export function characterHref(id: string | null | undefined): string | null {
  const key = (id ?? "").toLowerCase();
  return isCompareCharacter(key) ? `/characters/${key}` : null;
}

export function comparePairs(id: string): { other: string; slug: string }[] {
  const key = id.toLowerCase();
  const at = COMPARE_CHARACTERS.indexOf(key);
  if (at < 0) return [];
  return COMPARE_CHARACTERS.filter((c) => c !== key).map((other) => {
    const first = COMPARE_CHARACTERS.indexOf(other) < at ? other : key;
    const second = first === key ? other : key;
    return { other, slug: `${first}-vs-${second}` };
  });
}

export function poolLabel(pool: string | null | undefined, t: TFn): string {
  const key = (pool ?? "").trim();
  if (!key) return "";
  return t(key.charAt(0).toUpperCase() + key.slice(1).toLowerCase());
}

export function actHref(act: string | null | undefined): string | null {
  const m = (act ?? "").match(/^Act \d+ - ([A-Za-z][A-Za-z ]*)$/);
  if (!m) return null;
  return `/acts/${m[1].trim().toLowerCase().replace(/ +/g, "_")}`;
}

export const START_HERE_GUIDES = [
  "getting-started",
  "new-players-guide",
  "characters-guide",
  "keywords-guide",
];

export function startHereGuides<T extends { slug: string }>(guides: T[]): T[] {
  const bySlug = new Map(guides.map((g) => [g.slug, g]));
  return START_HERE_GUIDES.map((slug) => bySlug.get(slug)).filter(
    (g): g is T => g !== undefined,
  );
}
