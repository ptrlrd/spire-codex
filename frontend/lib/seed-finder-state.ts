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

export interface CountedPick {
  id: string;
  count: number;
}

export interface SeedFinderState {
  character: string;
  deck: CountedPick[];
  offered: CountedPick[];
  relics: string[];
  events: string[];
  ancient: string | null;
  ancientAct: number | null;
}

export const EMPTY_STATE: SeedFinderState = {
  character: "ANY",
  deck: [],
  offered: [],
  relics: [],
  events: [],
  ancient: null,
  ancientAct: null,
};

function cleanId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
}

export function parseCounted(raw: string | null): CountedPick[] {
  if (!raw) return [];
  const out: CountedPick[] = [];
  for (const part of raw.split(",")) {
    const [idRaw, nRaw] = part.split(":");
    const id = cleanId(idRaw ?? "");
    if (!id || out.some((p) => p.id === id)) continue;
    const n = parseInt(nRaw ?? "1", 10);
    out.push({
      id,
      count: Number.isFinite(n) ? Math.min(MAX_COPIES, Math.max(1, n)) : 1,
    });
  }
  return out;
}

export function formatCounted(picks: CountedPick[]): string {
  return picks
    .map((p) => (p.count > 1 ? `${p.id}:${p.count}` : p.id))
    .join(",");
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = cleanId(part);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function stateFromParams(params: URLSearchParams): SeedFinderState {
  const character = cleanId(params.get("character") ?? "");
  const act = parseInt(params.get("ancient_act") ?? "", 10);
  const ancient = cleanId(params.get("ancient") ?? "");
  return {
    character: (SEED_FINDER_CHARACTERS as readonly string[]).includes(character)
      ? character
      : "ANY",
    deck: parseCounted(params.get("deck")),
    offered: parseCounted(params.get("offered")),
    relics: parseIds(params.get("relics")),
    events: parseIds(params.get("events")),
    ancient: ancient || null,
    ancientAct: ancient && act >= 1 && act <= 4 ? act : null,
  };
}

export function paramsFromState(state: SeedFinderState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.character !== "ANY") params.set("character", state.character);
  if (state.deck.length) params.set("deck", formatCounted(state.deck));
  if (state.offered.length) params.set("offered", formatCounted(state.offered));
  if (state.relics.length) params.set("relics", state.relics.join(","));
  if (state.events.length) params.set("events", state.events.join(","));
  if (state.ancient) {
    params.set("ancient", state.ancient);
    if (state.ancientAct) params.set("ancient_act", String(state.ancientAct));
  }
  return params;
}

export function hasPredicates(state: SeedFinderState): boolean {
  return (
    state.deck.length > 0 ||
    state.offered.length > 0 ||
    state.relics.length > 0 ||
    state.events.length > 0 ||
    state.ancient !== null
  );
}
