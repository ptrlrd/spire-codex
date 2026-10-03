export type GameTable = Record<string, unknown>;
export type GameMessages = Record<string, GameTable>;
export type GameValues = Record<string, string | number>;

export const GAME_ROOT = "game";

export const RUN_PAGE_WHOLE_TABLES = [
  "static_hover_tips",
  "map",
  "run_history",
  "gameplay_ui",
  "rest_site_ui",
];

export const LIVE_TABLES = ["cards", "relics", "potions", "enchantments"];

export interface GameTranslator {
  (key: string, values?: GameValues): string;
  has(key: string): boolean;
  raw(key: string): unknown;
}

/** The message at `key`, or undefined when the pack has no string there. A
 * key that is both a leaf and a namespace keeps its leaf under "!". */
export function lookupGameMessage(
  t: GameTranslator,
  key: string,
  values?: GameValues,
): string | undefined {
  if (!key || !t.has(key)) return undefined;
  const raw = t.raw(key);
  if (typeof raw === "string") return t(key, values);
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as Record<string, unknown>)["!"] === "string"
  )
    return t(`${key}.!`, values);
  return undefined;
}
