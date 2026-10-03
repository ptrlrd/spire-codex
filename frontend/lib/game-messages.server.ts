import { createTranslator } from "next-intl";
import { API_INTERNAL } from "@/lib/api/endpoint.common";
import {
  GAME_ROOT,
  lookupGameMessage,
  type GameMessages,
  type GameTable,
  type GameTranslator,
  type GameValues,
} from "./game-messages.common";

const TABLE_TIMEOUT_MS = 5000;
const TABLE_REVALIDATE = 3600;

export interface GameTableRequest {
  locale: string;
  channel: "stable" | "beta";
}

async function fetchGameTable(
  table: string,
  { locale, channel }: GameTableRequest,
): Promise<GameTable> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TABLE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/localizations/${encodeURIComponent(table)}?lang=${locale}&channel=${channel}`,
      { signal: ctrl.signal, next: { revalidate: TABLE_REVALIDATE } },
    );
    if (!res.ok) return {};
    const body: unknown = await res.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as GameTable)
      : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** One request per table; a table that fails or times out resolves to {}. */
export async function fetchGameTables(
  tables: string[],
  request: GameTableRequest,
): Promise<Record<string, GameTable>> {
  const names = [...new Set(tables)];
  const loaded = await Promise.all(
    names.map((t) => fetchGameTable(t, request)),
  );
  return Object.fromEntries(names.map((name, i) => [name, loaded[i]]));
}

function copyPath(source: GameTable, target: GameTable, path: string) {
  const parts = path.split(".");
  let from: unknown = source;
  let to = target;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!from || typeof from !== "object") return;
    const value = (from as Record<string, unknown>)[part];
    if (value === undefined) return;
    if (i === parts.length - 1) {
      to[part] = value;
      return;
    }
    if (!value || typeof value !== "object") return;
    const existing = to[part];
    const container =
      existing && typeof existing === "object" ? (existing as GameTable) : {};
    to[part] = container;
    to = container;
    from = value;
  }
}

/** Only the listed entries per table. An entry is an id ("STRIKE") for the
 * whole record or a dotted path ("STRIKE.title") for one leaf; tables named
 * in `whole` are copied in full. Missing entries are skipped. */
export function pickGameMessages(
  tables: Record<string, GameTable>,
  wanted: Record<string, string[]>,
  options?: { whole?: string[] },
): GameMessages {
  const out: GameMessages = {};
  const whole = new Set(options?.whole ?? []);
  for (const table of whole) out[table] = tables[table] ?? {};
  for (const [table, ids] of Object.entries(wanted)) {
    if (whole.has(table)) continue;
    const picked: GameTable = out[table] ?? {};
    const source = tables[table];
    if (source) for (const id of ids) copyPath(source, picked, id);
    out[table] = picked;
  }
  return out;
}

/** A next-intl translator rooted at "game", so keys read "cards.STRIKE.title". */
export function createGameTranslator(
  messages: GameMessages,
  locale: string,
): GameTranslator {
  return createTranslator({
    locale,
    messages: { [GAME_ROOT]: messages } as Record<string, GameMessages>,
    namespace: GAME_ROOT,
    timeZone: "America/Los_Angeles",
    getMessageFallback: ({ key }) => key,
    onError: () => undefined,
  }) as unknown as GameTranslator;
}

export function tryGameMessage(
  t: GameTranslator,
  key: string,
  values?: GameValues,
): string | undefined {
  return lookupGameMessage(t, key, values);
}
