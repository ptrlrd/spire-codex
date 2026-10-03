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

export interface GridViewState {
  sort?: ColKey;
  dir?: 1 | -1;
  samples?: boolean;
  wax?: boolean;
  upg?: boolean;
}

export function parseGridView(
  sp: Record<string, string | string[] | undefined>,
  validCols: readonly ColKey[],
): GridViewState {
  const one = (k: string): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const out: GridViewState = {};
  const sort = one("sort");
  if (sort && (validCols as readonly string[]).includes(sort))
    out.sort = sort as ColKey;
  if (one("dir") === "asc") out.dir = 1;
  else if (one("dir") === "desc") out.dir = -1;
  if (one("samples") === "1") out.samples = true;
  if (one("wax") === "1") out.wax = true;
  if (one("upg") === "1") out.upg = true;
  return out;
}

export function writeGridView(
  params: URLSearchParams,
  state: GridViewState,
): void {
  if (state.sort) params.set("sort", state.sort);
  if (state.dir === 1) params.set("dir", "asc");
  if (state.samples) params.set("samples", "1");
  if (state.wax) params.set("wax", "1");
  if (state.upg) params.set("upg", "1");
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
