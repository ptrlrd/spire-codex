export const SEED_FINDER_CHARACTERS = [
  "IRONCLAD",
  "SILENT",
  "DEFECT",
  "NECROBINDER",
  "REGENT",
] as const;

export const MAX_COPIES = 4;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const LIMIT_STEPS = [10, 20, 50] as const;

export type ListKey =
  | "deck"
  | "offered"
  | "relics"
  | "events"
  | "neow"
  | "ancientOffers"
  | "bosses"
  | "elites"
  | "shop";

export const LIST_PARAMS: Record<ListKey, string> = {
  deck: "deck",
  offered: "offered",
  relics: "relics",
  events: "events",
  neow: "neow",
  ancientOffers: "ancient_offers",
  bosses: "bosses",
  elites: "elites",
  shop: "shop",
};

export interface Pick {
  id: string;
  count: number;
  act: number | null;
  floorMax: number | null;
  floorMin: number | null;
  seat: number | null;
}

export interface SeedFinderState {
  characters: string[];
  buildId: string;
  players: number | null;
  win: boolean;
  deck: Pick[];
  offered: Pick[];
  relics: Pick[];
  events: Pick[];
  neow: Pick[];
  ancientOffers: Pick[];
  bosses: Pick[];
  elites: Pick[];
  shop: Pick[];
  ancient: string | null;
  ancientAct: number | null;
}

export const LIST_KEYS: ListKey[] = [
  "deck",
  "offered",
  "relics",
  "events",
  "neow",
  "ancientOffers",
  "bosses",
  "elites",
  "shop",
];

export const EMPTY_STATE: SeedFinderState = {
  characters: [],
  buildId: "",
  players: null,
  win: false,
  deck: [],
  offered: [],
  relics: [],
  events: [],
  neow: [],
  ancientOffers: [],
  bosses: [],
  elites: [],
  shop: [],
  ancient: null,
  ancientAct: null,
};

export function cleanId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:]/g, "");
}

export function pick(id: string, extra: Partial<Pick> = {}): Pick {
  return {
    id,
    count: 1,
    act: null,
    floorMax: null,
    floorMin: null,
    seat: null,
    ...extra,
  };
}

const ITEM_RE =
  /^([A-Z0-9_:]+?)(?::(\d+))?(?:@(\d))?(?:<=(\d+))?(?:>=(\d+))?(?:#(\d))?$/;

export function parsePicks(raw: string | null): Pick[] {
  if (!raw) return [];
  const out: Pick[] = [];
  for (const part of raw.split(",")) {
    const cleaned = part.trim().toUpperCase().replace(/\s+/g, "");
    const m = cleaned.match(ITEM_RE);
    if (!m) continue;
    const id = m[1];
    if (!id || out.some((p) => p.id === id)) continue;
    const n = parseInt(m[2] ?? "1", 10);
    out.push({
      id,
      count: Number.isFinite(n) ? Math.min(MAX_COPIES, Math.max(1, n)) : 1,
      act: m[3] ? parseInt(m[3], 10) : null,
      floorMax: m[4] ? parseInt(m[4], 10) : null,
      floorMin: m[5] ? parseInt(m[5], 10) : null,
      seat: m[6] ? parseInt(m[6], 10) : null,
    });
  }
  return out;
}

export function formatPick(p: Pick): string {
  let s = p.id;
  if (p.count > 1) s += `:${p.count}`;
  if (p.act) s += `@${p.act}`;
  if (p.floorMax != null) s += `<=${p.floorMax}`;
  if (p.floorMin != null) s += `>=${p.floorMin}`;
  if (p.seat) s += `#${p.seat}`;
  return s;
}

export function formatPicks(picks: Pick[]): string {
  return picks.map(formatPick).join(",");
}

export function stateFromParams(params: URLSearchParams): SeedFinderState {
  const characters = (params.get("character") ?? "")
    .split(/[,+]/)
    .map(cleanId)
    .filter((c) => (SEED_FINDER_CHARACTERS as readonly string[]).includes(c));
  const players = parseInt(params.get("players") ?? "", 10);
  const act = parseInt(params.get("ancient_act") ?? "", 10);
  const ancient = cleanId(params.get("ancient") ?? "");
  const state: SeedFinderState = {
    ...EMPTY_STATE,
    characters: [...new Set(characters)],
    buildId: (params.get("build_id") ?? "").trim().slice(0, 24),
    players: players >= 1 && players <= 4 ? players : null,
    win: params.get("win") === "true",
    ancient: ancient || null,
    ancientAct: ancient && act >= 1 && act <= 4 ? act : null,
  };
  for (const key of LIST_KEYS)
    state[key] = parsePicks(params.get(LIST_PARAMS[key]));
  return state;
}

export function paramsFromState(state: SeedFinderState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.characters.length)
    params.set("character", state.characters.join(","));
  if (state.buildId) params.set("build_id", state.buildId);
  if (state.players) params.set("players", String(state.players));
  if (state.win) params.set("win", "true");
  for (const key of LIST_KEYS) {
    if (state[key].length)
      params.set(LIST_PARAMS[key], formatPicks(state[key]));
  }
  if (state.ancient) {
    params.set("ancient", state.ancient);
    if (state.ancientAct) params.set("ancient_act", String(state.ancientAct));
  }
  return params;
}

export function hasPredicates(state: SeedFinderState): boolean {
  return LIST_KEYS.some((k) => state[k].length > 0) || state.ancient !== null;
}

export function predicateCount(state: SeedFinderState): number {
  return (
    LIST_KEYS.reduce((n, k) => n + state[k].length, 0) + (state.ancient ? 1 : 0)
  );
}
