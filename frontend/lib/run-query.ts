// Parse an ascension value: "20" → exact, "3-4" → range, "3+" → min.
// Tolerates the in-game "A10" spelling ("a10", "a3-a7").
export function parseAscension(value: string): {
  exact?: number;
  min?: number;
  max?: number;
} {
  const v = value.trim().replace(/a(?=\d)/gi, "");
  if (!v) return {};
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(v);
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  const min = /^(\d+)\s*\+$/.exec(v);
  if (min) return { min: parseInt(min[1], 10) };
  const num = parseInt(v, 10);
  if (!Number.isNaN(num)) return { exact: num };
  return {};
}

// Parse `key:value` expressions out of a free-text query.
// Returns extracted filters and the remaining free-text (after stripping
// recognized key:value pairs).
export type QueryKey =
  | "user"
  | "seed"
  | "char"
  | "asc"
  | "version"
  | "mode"
  | "result"
  | "players"
  | "card"
  | "relic"
  | "shop"
  | "winrate";

export function parseQuery(q: string): {
  filters: Partial<Record<QueryKey, string>>;
  rest: string;
} {
  const filters: Record<string, string> = {};
  const tokens = q.match(/(\w+):"[^"]+"|\w+:[\S]+|[^\s]+/g) || [];
  const restTokens: string[] = [];
  // card/relic accumulate across repeated tokens AND comma-separated values
  const appendMulti = (existing: string | undefined, value: string) =>
    existing ? `${existing},${value}` : value;
  for (let i = 0; i < tokens.length; i++) {
    let tok = tokens[i];
    // Tolerate a space after the colon ("asc: 10"): a bare "key:" token
    // absorbs the next token as its value. Without this the pair fell
    // through to the username search and silently matched nothing.
    if (
      /^[a-z]+:$/i.test(tok) &&
      tokens[i + 1] &&
      !tokens[i + 1].includes(":")
    ) {
      tok = tok + tokens[i + 1];
      i++;
    }
    const m = /^([a-z]+):"?([^"]+)"?$/i.exec(tok);
    if (!m) {
      restTokens.push(tok);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2];
    if (["user", "username", "u"].includes(key)) filters.user = value;
    else if (["seed", "s"].includes(key)) filters.seed = value;
    else if (["char", "character", "c"].includes(key)) filters.char = value;
    else if (["asc", "ascension", "a"].includes(key)) filters.asc = value;
    else if (["version", "v", "build"].includes(key)) filters.version = value;
    else if (["mode", "gamemode"].includes(key)) filters.mode = value;
    else if (["result", "win"].includes(key)) filters.result = value;
    else if (["players", "p"].includes(key)) filters.players = value;
    else if (["card", "cards"].includes(key))
      filters.card = appendMulti(filters.card, value);
    else if (["relic", "relics"].includes(key))
      filters.relic = appendMulti(filters.relic, value);
    else if (["shop", "bought", "buy"].includes(key))
      filters.shop = appendMulti(filters.shop, value);
    else if (["winrate", "wr"].includes(key)) filters.winrate = value;
    else restTokens.push(tok);
  }
  return { filters, rest: restTokens.join(" ").trim() };
}

// "50-70" -> {min:50, max:70}; "100" -> {min:100, max:100}; "60-" / "60+" /
// ">=60" -> {min:60}; "-40" / "<=40" -> {max:40}; ">50" excludes exactly-50
// via a small epsilon, "<50" likewise. A trailing % is tolerated everywhere.
// Anything non-numeric parses to {} and is ignored.
export function parseWinrate(expr: string): { min?: number; max?: number } {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const e = expr.trim().replace(/%/g, "");
  const cmp = /^(>=|<=|>|<)\s*(\d{1,3}(?:\.\d+)?)$/.exec(e);
  if (cmp) {
    const v = clamp(parseFloat(cmp[2]));
    if (cmp[1] === ">=") return { min: v };
    if (cmp[1] === "<=") return { max: v };
    if (cmp[1] === ">") return { min: clamp(v + 0.01) };
    return { max: clamp(v - 0.01) };
  }
  const plus = /^(\d{1,3}(?:\.\d+)?)\+$/.exec(e);
  if (plus) return { min: clamp(parseFloat(plus[1])) };
  const range = /^(\d{1,3}(?:\.\d+)?)?\s*-\s*(\d{1,3}(?:\.\d+)?)?$/.exec(e);
  if (range && (range[1] !== undefined || range[2] !== undefined)) {
    const out: { min?: number; max?: number } = {};
    if (range[1] !== undefined) out.min = clamp(parseFloat(range[1]));
    if (range[2] !== undefined) out.max = clamp(parseFloat(range[2]));
    return out;
  }
  const single = /^(\d{1,3}(?:\.\d+)?)$/.exec(e);
  if (single) {
    const v = clamp(parseFloat(single[1]));
    return { min: v, max: v };
  }
  return {};
}

// Expand a version expression to the list of build_ids it covers.
// "v0.104.0-v0.106.0" → all versions between (inclusive), using the
// already numeric-sorted `versions` list. A single version returns [it].
export function expandVersionRange(expr: string, versions: string[]): string[] {
  const range = expr.split("-").map((s) => s.trim());
  if (range.length !== 2) return versions.includes(expr) ? [expr] : [expr];
  const [a, b] = range;
  const ia = versions.indexOf(a);
  const ib = versions.indexOf(b);
  if (ia === -1 || ib === -1) return [expr];
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  return versions.slice(lo, hi + 1);
}

/** API params for the filters a search expression names. Free text and the
 *  user/winrate keys are left to the caller, since they mean different things
 *  on the run browser and on one player's own runs. */
export function queryParams(
  filters: Partial<Record<QueryKey, string>>,
  versions: string[],
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.char) params.set("character", filters.char.toUpperCase());
  if (filters.result === "win") params.set("win", "true");
  else if (filters.result === "loss") params.set("win", "false");
  if (filters.seed) params.set("seed", filters.seed);
  if (filters.version) {
    if (filters.version.includes("-") && versions.length > 0)
      params.set(
        "build_ids",
        expandVersionRange(filters.version, versions).join(","),
      );
    else params.set("build_id", filters.version);
  }
  if (filters.players === "single" || filters.players === "multi")
    params.set("players", filters.players);
  if (
    filters.mode === "daily" ||
    filters.mode === "custom" ||
    filters.mode === "standard"
  )
    params.set("game_mode", filters.mode);
  if (filters.asc) {
    const asc = parseAscension(filters.asc);
    if (asc.exact !== undefined) params.set("ascension", String(asc.exact));
    if (asc.min !== undefined) params.set("ascension_min", String(asc.min));
    if (asc.max !== undefined) params.set("ascension_max", String(asc.max));
  }
  if (filters.card) params.set("card", filters.card);
  if (filters.relic) params.set("relic", filters.relic);
  if (filters.shop) params.set("shop", filters.shop);
  return params;
}
