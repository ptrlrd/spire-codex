import { inCharacterOrder } from "@/lib/character-order";

interface Row {
  id: string;
  beta?: boolean;
}

/** Flags rows that only the merged main plus beta list has, and puts the
 * characters in the site's character order. */
export function markBetaUnlocks<D extends object>(
  merged: D,
  main: object | null,
): D {
  const mainLists = (main ?? {}) as Record<string, unknown>;
  const out = { ...merged } as Record<string, unknown>;
  for (const [key, rows] of Object.entries(merged)) {
    if (!Array.isArray(rows)) continue;
    const known = mainLists[key];
    const mainIds = Array.isArray(known)
      ? new Set((known as Row[]).map((r) => r.id))
      : null;
    const marked = (rows as Row[]).map((row) =>
      mainIds && !mainIds.has(row.id) ? { ...row, beta: true } : row,
    );
    out[key] =
      key === "characters" ? inCharacterOrder(marked, (r) => r.id) : marked;
  }
  return out as D;
}
