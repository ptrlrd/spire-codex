import type { ColKey } from "./kinds";
import type { GridKind } from "./types";

export interface GridPrefs {
  bracket?: string;
  character?: string;
  by?: string;
  query?: string;
  showTiny?: boolean;
  showWax?: boolean;
  showUpgraded?: boolean;
  offColor?: boolean;
  sortKey?: ColKey;
  dir?: 1 | -1;
  columns?: ColKey[];
}

const KEY = (kind: GridKind) => `spire-codex:stats-grid:${kind}`;

export function loadPrefs(kind: GridKind): GridPrefs | null {
  try {
    const raw = window.localStorage.getItem(KEY(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as GridPrefs) : null;
  } catch {
    return null;
  }
}

export function savePrefs(kind: GridKind, prefs: GridPrefs): void {
  try {
    window.localStorage.setItem(KEY(kind), JSON.stringify(prefs));
  } catch {}
}

export function clearPrefs(kind: GridKind): void {
  try {
    window.localStorage.removeItem(KEY(kind));
  } catch {}
}

export function orderColumns(
  base: ColKey[],
  order: ColKey[] | undefined,
): ColKey[] {
  if (!order || order.length === 0) return base;
  const wanted = order.filter((k) => base.includes(k));
  const rest = base.filter((k) => !wanted.includes(k));
  const out = [...wanted, ...rest];
  const i = out.indexOf("name");
  if (i > 0) {
    out.splice(i, 1);
    out.unshift("name");
  }
  return out;
}

export function moveColumn(
  order: ColKey[],
  from: ColKey,
  to: ColKey,
): ColKey[] {
  if (from === to || from === "name") return order;
  const out = order.filter((k) => k !== from);
  const at = out.indexOf(to);
  if (at < 0) return order;
  out.splice(to === "name" ? 1 : at, 0, from);
  return out;
}
