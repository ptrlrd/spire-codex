import { getT } from "@/lib/i18n-server";
import { restSiteLabel } from "@/lib/rest-site-labels";
import { CHARACTERS, isValidBracket } from "./bracket";
import type { GridData, GridKind, GridRow, GridTotals } from "./types";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";
const FETCH_TTL = 300;

interface Catalog {
  id: string;
  name: string;
  color?: string;
  type?: string;
  rarity?: string;
  rarity_key?: string | null;
  pool?: string;
  image_url: string | null;
}

interface EventOption {
  id: string;
  title: string;
  description?: string | null;
}

interface EventCatalog {
  id: string;
  name: string;
  options?: EventOption[] | null;
  pages?: { options?: EventOption[] | null }[] | null;
}

function tailOf(id: string): string {
  const m = id.match(/_([A-Za-z0-9]+)$/);
  return m ? m[1] : "";
}

interface ApiRow {
  id?: string;
  upgraded?: boolean;
  score?: number | null;
  tier?: string | null;
  elo?: number | null;
  win_rate?: number | null;
  win_rate_ci?: [number, number] | null;
  pick_rate?: number | null;
  hold_rate?: number | null;
  use_rate?: number | null;
  buy_rate?: number | null;
  share?: number | null;
  low_hp_share?: number | null;
  lift?: number | null;
  lift_n?: number | null;
  picks?: number;
  wins?: number;
  losses?: number;
  offered?: number;
  picked?: number;
  pick_rate_by_act?: (number | null)[];
  wax?: {
    picks: number;
    wins: number;
    win_rate: number | null;
    win_rate_ci: [number, number] | null;
  } | null;
  entity_type?: string;
  seen?: number;
  bought?: number;
  event?: string;
  option?: string;
  chosen?: number;
  choice?: string;
  name?: string | null;
}

interface ApiResponse {
  bracket?: string;
  baseline_win_rate?: number;
  total_runs?: number;
  total_seats?: number;
  total_wins?: number;
  data_through?: string | null;
  rows?: ApiRow[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: FETCH_TTL } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s.replace(/\[[^\]]*\]/g, "");
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function ci(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 ? [v[0], v[1]] : null;
}

function baseRow(key: string, id: string, name: string): GridRow {
  return {
    key,
    id,
    href: null,
    name,
    sub: null,
    group: "",
    rarity: null,
    hint: null,
    subNote: null,
    color: null,
    imageUrl: null,
    upgraded: false,
    n: 0,
    score: null,
    tier: null,
    elo: null,
    winRate: null,
    winRateCi: null,
    pickRate: null,
    holdRate: null,
    useRate: null,
    buyRate: null,
    share: null,
    lowHpShare: null,
    lift: null,
    liftN: null,
    offered: null,
    picked: null,
    wins: null,
    losses: null,
    pickAct1: null,
    pickAct2: null,
    pickAct3: null,
  };
}

function fillCommon(row: GridRow, m: ApiRow): GridRow {
  row.score = num(m.score);
  row.tier = m.tier ?? null;
  row.elo = num(m.elo);
  row.winRate = num(m.win_rate);
  row.winRateCi = ci(m.win_rate_ci);
  row.lift = num(m.lift);
  row.liftN = num(m.lift_n);
  row.wins = num(m.wins);
  return row;
}

function totalsOf(res: ApiResponse | null): GridTotals {
  return {
    totalRuns: res?.total_runs ?? 0,
    totalSeats: num(res?.total_seats),
    totalWins: num(res?.total_wins),
    baselineWinRate: num(res?.baseline_win_rate),
    dataThrough: res?.data_through ?? null,
  };
}

function catalogMap(list: Catalog[] | null): Map<string, Catalog> {
  const m = new Map<string, Catalog>();
  for (const c of list || []) m.set(c.id.toUpperCase(), c);
  return m;
}

async function loadEntity(
  kind: "cards" | "relics" | "potions",
  lang: string,
  bracket: string,
  character: string,
): Promise<GridData> {
  const [t, catalog, res] = await Promise.all([
    getT(lang as Parameters<typeof getT>[0]),
    fetchJson<Catalog[]>(`${API_INTERNAL}/api/${kind}?lang=${lang}`),
    fetchJson<ApiResponse>(
      `${API_INTERNAL}/api/runs/metrics/${kind}?bracket=${bracket}${
        character ? `&character=${character}` : ""
      }`,
    ),
  ]);
  const byId = catalogMap(catalog);
  const rows: GridRow[] = [];
  for (const m of res?.rows || []) {
    const id = (m.id || "").toUpperCase();
    const c = byId.get(id);
    if (!c) continue;
    const upgraded = !!m.upgraded;
    const row = fillCommon(
      baseRow(
        `${id}${upgraded ? "+" : ""}`,
        id,
        upgraded ? `${c.name}+` : c.name,
      ),
      m,
    );
    row.href = `/${kind}/${id.toLowerCase()}`;
    row.upgraded = upgraded;
    row.imageUrl = c.image_url;
    row.color = c.color ?? null;
    row.group =
      kind === "cards"
        ? (c.color || "").toLowerCase()
        : (c.pool || "").toLowerCase();
    row.rarity = (c.rarity_key || c.rarity || "").toLowerCase() || null;
    row.sub =
      kind === "cards"
        ? [c.type, c.rarity].filter(Boolean).join(" · ")
        : c.rarity_key || c.rarity || null;
    row.n = m.picks ?? 0;
    row.losses =
      m.losses ?? (row.wins === null ? null : Math.max(0, row.n - row.wins));
    row.pickRate = kind === "potions" ? null : num(m.pick_rate);
    row.holdRate = num(m.hold_rate);
    row.useRate = kind === "potions" ? num(m.use_rate) : null;
    row.offered = kind === "potions" ? null : num(m.offered);
    row.picked = kind === "potions" ? null : num(m.picked);
    const acts = m.pick_rate_by_act || [];
    row.pickAct1 = num(acts[0]);
    row.pickAct2 = num(acts[1]);
    row.pickAct3 = num(acts[2]);
    rows.push(row);
    if (m.wax && m.wax.picks > 0) {
      const w = baseRow(`${id}:WAX`, id, t("Wax {name}", { name: c.name }));
      w.href = row.href;
      w.imageUrl = c.image_url;
      w.color = c.color ?? null;
      w.group = row.group;
      w.rarity = row.rarity;
      w.sub = row.sub;
      w.n = m.wax.picks;
      w.wins = m.wax.wins;
      w.losses = Math.max(0, w.n - w.wins);
      w.winRate = num(m.wax.win_rate);
      w.winRateCi = ci(m.wax.win_rate_ci);
      w.holdRate =
        typeof res?.total_seats === "number" && res.total_seats > 0
          ? Math.round((w.n / res.total_seats) * 1000) / 10
          : null;
      rows.push(w);
    }
  }
  return {
    kind,
    rows,
    totals: totalsOf(res),
    bracket: res?.bracket || bracket,
    character,
    available: res !== null,
  };
}

async function loadShops(lang: string, bracket: string): Promise<GridData> {
  const [cards, relics, potions, res] = await Promise.all([
    fetchJson<Catalog[]>(`${API_INTERNAL}/api/cards?lang=${lang}`),
    fetchJson<Catalog[]>(`${API_INTERNAL}/api/relics?lang=${lang}`),
    fetchJson<Catalog[]>(`${API_INTERNAL}/api/potions?lang=${lang}`),
    fetchJson<ApiResponse>(
      `${API_INTERNAL}/api/runs/metrics/shops?bracket=${bracket}`,
    ),
  ]);
  const maps = {
    cards: catalogMap(cards),
    relics: catalogMap(relics),
    potions: catalogMap(potions),
  };
  const rows: GridRow[] = [];
  for (const m of res?.rows || []) {
    const etype = (m.entity_type || "") as keyof typeof maps;
    const id = (m.id || "").toUpperCase();
    const c = maps[etype]?.get(id);
    if (!c) continue;
    const row = fillCommon(baseRow(`${etype}:${id}`, id, c.name), m);
    row.href = `/${etype}/${id.toLowerCase()}`;
    row.imageUrl = c.image_url;
    row.color = c.color ?? null;
    row.group = etype;
    row.sub = c.rarity_key || c.rarity || null;
    row.n = m.bought ?? 0;
    row.losses = row.wins === null ? null : Math.max(0, row.n - row.wins);
    row.offered = num(m.seen);
    row.picked = num(m.bought);
    row.buyRate = num(m.buy_rate);
    rows.push(row);
  }
  return {
    kind: "shops",
    rows,
    totals: totalsOf(res),
    bracket: res?.bracket || bracket,
    character: "",
    available: res !== null,
  };
}

async function loadEvents(lang: string, bracket: string): Promise<GridData> {
  const [events, res] = await Promise.all([
    fetchJson<EventCatalog[]>(`${API_INTERNAL}/api/events?lang=${lang}`),
    fetchJson<ApiResponse>(
      `${API_INTERNAL}/api/runs/metrics/events?bracket=${bracket}`,
    ),
  ]);
  const names = new Map<string, string>();
  const options = new Map<string, Record<string, EventOption>>();
  for (const e of events || []) {
    const eid = e.id.toUpperCase();
    names.set(eid, e.name);
    const opts: Record<string, EventOption> = {};
    for (const o of e.options ?? []) opts[o.id] = o;
    for (const p of e.pages ?? [])
      for (const o of p.options ?? []) opts[o.id] ??= o;
    options.set(eid, opts);
  }
  const rows: GridRow[] = [];
  for (const m of res?.rows || []) {
    const eid = (m.event || "").toUpperCase();
    const oid = m.option || "";
    const name = names.get(eid);
    if (!name) continue;
    const opts = options.get(eid) || {};
    const opt = opts[oid] ?? opts[oid.replace(/_\d+$/, "")];
    const row = fillCommon(baseRow(`${eid}:${oid}`, eid, name), m);
    row.href = `/events/${eid.toLowerCase()}`;
    row.sub = opt ? stripTags(opt.title) : oid;
    row.hint = opt?.description ? stripTags(opt.description) : null;
    row.group = eid;
    row.n = m.chosen ?? 0;
    row.losses = row.wins === null ? null : Math.max(0, row.n - row.wins);
    row.share = num(m.share);
    rows.push(row);
  }
  const seen = new Map<string, GridRow[]>();
  for (const r of rows) {
    const k = `${r.group}|${r.sub}`;
    const list = seen.get(k);
    if (list) list.push(r);
    else seen.set(k, [r]);
  }
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    const tails = list.map((r) => tailOf(r.key.slice(r.group.length + 1)));
    const numeric = [...new Set(tails.filter((x) => /^\d+$/.test(x)))]
      .map(Number)
      .sort((a, b) => a - b);
    list.forEach((r, i) => {
      const tail = tails[i];
      r.subNote = /^\d+$/.test(tail)
        ? String(numeric.indexOf(Number(tail)) + 1)
        : tail
          ? tail.toLowerCase()
          : "1";
    });
  }
  return {
    kind: "events",
    rows,
    totals: totalsOf(res),
    bracket: res?.bracket || bracket,
    character: "",
    available: res !== null,
  };
}

async function loadCampfires(lang: string, bracket: string): Promise<GridData> {
  const [t, res] = await Promise.all([
    getT(lang as Parameters<typeof getT>[0]),
    fetchJson<ApiResponse>(
      `${API_INTERNAL}/api/runs/metrics/campfires?bracket=${bracket}&lang=${lang}`,
    ),
  ]);
  const rows: GridRow[] = [];
  for (const m of res?.rows || []) {
    const cid = (m.choice || "").toUpperCase();
    if (!cid) continue;
    const row = fillCommon(
      baseRow(cid, cid, m.name || restSiteLabel(cid, t)),
      m,
    );
    row.group = cid;
    row.n = m.chosen ?? 0;
    row.losses = row.wins === null ? null : Math.max(0, row.n - row.wins);
    row.share = num(m.share);
    row.lowHpShare = num(m.low_hp_share);
    rows.push(row);
  }
  return {
    kind: "campfires",
    rows,
    totals: totalsOf(res),
    bracket: res?.bracket || bracket,
    character: "",
    available: res !== null,
  };
}

export async function loadGrid(
  kind: GridKind,
  lang: string,
  bracket = "all",
  character = "",
): Promise<GridData> {
  const valid = isValidBracket(bracket) ? bracket || "all" : "all";
  const char = CHARACTERS.includes(character.toUpperCase())
    ? character.toUpperCase()
    : "";
  switch (kind) {
    case "cards":
    case "relics":
    case "potions":
      return loadEntity(kind, lang, valid, char);
    case "shops":
      return loadShops(lang, valid);
    case "events":
      return loadEvents(lang, valid);
    case "campfires":
      return loadCampfires(lang, valid);
  }
}
