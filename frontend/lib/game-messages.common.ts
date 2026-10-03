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

export const LIVE_TABLES = [
  "cards",
  "relics",
  "potions",
  "enchantments",
  "characters",
  "gameplay_ui",
];

export const REPLAY_TABLES = [
  ...LIVE_TABLES,
  "monsters",
  "encounters",
  "events",
];

export interface GameTranslator {
  (key: string, values?: GameValues): string;
  has(key: string): boolean;
  raw(key: string): unknown;
}

/** The message at `key`, or undefined when the pack has no string there. A
 * key that is both a leaf and a namespace keeps its leaf under "!". */
const ARG_HEAD =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(,\s*(plural|selectordinal|number)\b)?/;

function topLevelArgs(raw: string): { name: string; numeric: boolean }[] {
  const out: { name: string; numeric: boolean }[] = [];
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "'") {
      if (raw[i + 1] === "'") i += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (ch === "{") {
      if (depth === 0) {
        const m = ARG_HEAD.exec(raw.slice(i + 1));
        if (m) out.push({ name: m[1], numeric: !!m[3] });
      }
      depth += 1;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return out;
}

/** Values for every ICU argument the message names that the caller did not
 * supply, so a template like "Give {Relic}" still renders when the run does
 * not record what filled the slot: the argument name for text slots, 0 for
 * numeric ones. */
export function fillMissingValues(
  raw: string,
  values?: GameValues,
): GameValues | undefined {
  const out: GameValues = { ...(values ?? {}) };
  let added = false;
  for (const { name, numeric } of topLevelArgs(raw)) {
    if (name in out) continue;
    out[name] = numeric ? 0 : name;
    added = true;
  }
  return added ? out : values;
}

export function lookupGameMessage(
  t: GameTranslator,
  key: string,
  values?: GameValues,
): string | undefined {
  if (!key || !t.has(key)) return undefined;
  const raw = t.raw(key);
  if (typeof raw === "string") return format(t, key, raw, values);
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as Record<string, unknown>)["!"] === "string"
  ) {
    const leaf = (raw as Record<string, string>)["!"];
    return format(t, `${key}.!`, leaf, values);
  }
  return undefined;
}

/** Formats one pack string; an empty string, or a formatting failure that
 * handed back the key, counts as missing so callers' fallbacks fire. */
function format(
  t: GameTranslator,
  key: string,
  raw: string,
  values?: GameValues,
): string | undefined {
  if (raw === "") return undefined;
  const out = t(key, fillMissingValues(raw, values));
  return out === key || out === "" ? undefined : out;
}
