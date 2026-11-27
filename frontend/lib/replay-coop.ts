// replay_version 10 co-op journals also describe the teammate (see the mod's
// docs/replay-journal-v10.md). The timeline and the scene show the uploader's
// own run, so the rows v10 newly writes for a teammate are left out here:
// their event pages and choices, their opening draw order, their arrow slots
// and their Crystal Sphere. Rows that already carried `mine:false` before v10
// (energy, gold, hp, pick, buy...) are handled where they are read, as before.
// `peer_deck` and `peer_msg` are teammate-only by kind.

const TEAMMATE_ROWS = new Set([
  "decision",
  "outcome",
  "draw_order",
  "arrow",
  "sphere_dig",
  "sphere_reveal",
  "sphere_end",
]);

const TEAMMATE_KINDS = new Set(["peer_deck", "peer_msg"]);

export function isTeammateRow(raw: Record<string, unknown>): boolean {
  const t = raw.t;
  if (typeof t !== "string") return false;
  if (TEAMMATE_KINDS.has(t)) return true;
  return raw.mine === false && TEAMMATE_ROWS.has(t);
}
