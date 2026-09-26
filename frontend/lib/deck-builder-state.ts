export const DECK_BUILDER_CHARACTERS = [
  "IRONCLAD",
  "SILENT",
  "DEFECT",
  "NECROBINDER",
  "REGENT",
] as const;

export const MAX_OFFER = 5;
export const DRAFT_STORAGE_KEY = "deck-builder:draft";

export interface DeckBuilderState {
  character: string;
  deck: string[];
  relics: string[];
  offer: string[];
  target: string | null;
}

export const EMPTY_DRAFT: DeckBuilderState = {
  character: "SILENT",
  deck: [],
  relics: [],
  offer: [],
  target: null,
};

function cleanId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
}

function cleanTarget(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "+")
    .replace(/[^A-Z0-9_+]/g, "");
}

export function parseDeck(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const [idRaw, nRaw] = part.split(":");
    const id = cleanId(idRaw ?? "");
    if (!id) continue;
    const n = parseInt(nRaw ?? "1", 10);
    const copies = Number.isFinite(n) ? Math.min(9, Math.max(1, n)) : 1;
    for (let i = 0; i < copies; i++) out.push(id);
  }
  return out.slice(0, 120);
}

export function formatDeck(deck: string[]): string {
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, n]) => (n > 1 ? `${id}:${n}` : id))
    .join(",");
}

function parseIds(raw: string | null, max: number): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = cleanId(part);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function isCharacter(value: string): boolean {
  return (DECK_BUILDER_CHARACTERS as readonly string[]).includes(value);
}

export function stateFromParams(params: URLSearchParams): DeckBuilderState {
  const character = cleanId(params.get("character") ?? "");
  const target = cleanTarget(params.get("target") ?? "");
  return {
    character: isCharacter(character) ? character : EMPTY_DRAFT.character,
    deck: parseDeck(params.get("deck")),
    relics: parseIds(params.get("relics"), 60),
    offer: parseIds(params.get("offer"), MAX_OFFER),
    target: target || null,
  };
}

export function paramsFromState(state: DeckBuilderState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.character !== EMPTY_DRAFT.character)
    params.set("character", state.character);
  if (state.deck.length) params.set("deck", formatDeck(state.deck));
  if (state.relics.length) params.set("relics", state.relics.join(","));
  if (state.offer.length) params.set("offer", state.offer.join(","));
  if (state.target) params.set("target", state.target);
  return params;
}

export function hasDraft(state: DeckBuilderState): boolean {
  return state.deck.length > 0 || state.relics.length > 0;
}

export function isEmptyDraft(state: DeckBuilderState): boolean {
  return !hasDraft(state) && state.offer.length === 0 && !state.target;
}

export function draftFromStorage(raw: string | null): DeckBuilderState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const params = new URLSearchParams();
    if (typeof parsed.character === "string")
      params.set("character", parsed.character);
    if (Array.isArray(parsed.deck))
      params.set("deck", formatDeck(parsed.deck.map(String)));
    if (Array.isArray(parsed.relics))
      params.set("relics", parsed.relics.map(String).join(","));
    if (Array.isArray(parsed.offer))
      params.set("offer", parsed.offer.map(String).join(","));
    if (typeof parsed.target === "string") params.set("target", parsed.target);
    const state = stateFromParams(params);
    return isEmptyDraft(state) ? null : state;
  } catch {
    return null;
  }
}

export function draftToStorage(state: DeckBuilderState): string {
  return JSON.stringify({
    character: state.character,
    deck: state.deck,
    relics: state.relics,
    offer: state.offer,
    target: state.target,
  });
}

export function takePercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}
