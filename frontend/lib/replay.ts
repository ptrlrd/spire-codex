// Parses the mod's replay journal (newline-delimited JSON, one action per
// line) into the shape the replay page renders: one entry per floor, the act
// maps, the decisions with their offered options and what was picked, and
// each combat broken into turns. Pure: no fetching, no React.

import type { Coord, MapEdge, MapNode } from "@/app/live/live-shared";

export interface ReplayLine {
  t: string;
  s: number;
  ms?: number;
  floor?: number;
  act?: number;
  [key: string]: unknown;
}

export interface ReplayOption {
  index: number;
  kind: string;
  id: string;
  label?: string;
  grantsRelic?: string;
  instanceId?: number;
  upgraded: boolean;
  presented: boolean;
  selectable: boolean;
  reason?: string;
  chosen: boolean;
}

export interface ReplayDecision {
  id: number;
  type: string;
  source: string;
  selectKind?: string;
  eventId?: string;
  nPresented: number;
  nSelectable: number;
  declineAvailable?: boolean;
  goldOnHand?: number;
  options: ReplayOption[];
  outcome: string | null;
  paid?: { kind: string; id?: string; cost: number; resource: string };
  resolutions: ReplayLine[];
  s: number;
}

export interface ReplayTurn {
  n: number;
  side: string;
  lines: ReplayLine[];
}

export interface ReplayCombat {
  encounter: string;
  enemies: { i: number; id: string; hp: number; maxHp: number }[];
  turns: ReplayTurn[];
  result: string;
  turnCount: number | null;
  damageTaken: number;
  hpEnd: number | null;
}

export interface ReplayFloor {
  floor: number;
  act: number;
  kind: string;
  id: string | null;
  coord: Coord | null;
  s: number;
  lines: ReplayLine[];
  decisions: ReplayDecision[];
  combat: ReplayCombat | null;
  hpAfter: number | null;
  goldAfter: number | null;
}

export interface ReplayMap {
  act: number;
  nodes: MapNode[];
  edges: MapEdge[];
  boss?: string;
  ancient?: string;
}

export interface ReplayModel {
  header: Record<string, unknown>;
  end: Record<string, unknown> | null;
  maps: Record<number, ReplayMap>;
  floors: ReplayFloor[];
  actNames: Record<number, string>;
  startingDeck: { c: number; id: string }[];
  finalDeck: { c: number; id: string }[];
  lineCount: number;
}

const COMBAT_KINDS = new Set(["combat", "monster", "elite", "boss"]);
const NODE_KINDS_FOR_ROOM: Record<string, string[]> = {
  combat: ["monster", "elite", "boss"],
  monster: ["monster"],
  elite: ["elite"],
  boss: ["boss"],
  merchant: ["shop"],
  shop: ["shop"],
  restsite: ["restsite"],
  rest: ["restsite"],
  treasure: ["treasure"],
  event: ["event", "unknown", "ancient"],
  unknown: ["unknown", "event"],
  ancient: ["ancient"],
};
const RESOLUTIONS = new Set(["acquire", "remove", "upgrade", "transform", "relic", "resolve", "buy"]);

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseCoord(v: unknown): Coord | null {
  if (typeof v !== "string") return null;
  const [c, r] = v.split(",").map((x) => parseInt(x.trim(), 10));
  return Number.isFinite(c) && Number.isFinite(r) ? [c, r] : null;
}

export function parseReplayLines(text: string): ReplayLine[] {
  const out: ReplayLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object" && typeof obj.t === "string") out.push(obj as ReplayLine);
    } catch {
      // a torn line at the end of a crashed recording is expected; skip it
    }
  }
  return out;
}

function buildMap(line: ReplayLine): ReplayMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const rawNodes = Array.isArray(line.nodes) ? (line.nodes as Record<string, unknown>[]) : [];
  for (const n of rawNodes) {
    const c = parseCoord(n.coord);
    if (!c) continue;
    nodes.push([c[0], c[1], String(n.kind ?? "node").toLowerCase()]);
    for (const child of Array.isArray(n.children) ? n.children : []) {
      const cc = parseCoord(child);
      if (cc) edges.push([c[0], c[1], cc[0], cc[1]]);
    }
  }
  for (const key of ["boss_coord", "boss2_coord"]) {
    const bc = parseCoord(line[key]);
    if (bc && !nodes.some((n) => n[0] === bc[0] && n[1] === bc[1])) nodes.push([bc[0], bc[1], "boss"]);
  }
  return { act: num(line.act) ?? 1, nodes, edges, boss: str(line.boss) ?? undefined };
}

function buildDecision(line: ReplayLine): ReplayDecision {
  const raw = Array.isArray(line.options) ? (line.options as Record<string, unknown>[]) : [];
  return {
    id: num(line.decision_id) ?? 0,
    type: str(line.decision_type) ?? "unknown",
    source: str(line.source) ?? "",
    selectKind: str(line.select_kind) ?? undefined,
    eventId: str(line.event_id) ?? undefined,
    nPresented: num(line.n_presented) ?? raw.length,
    nSelectable: num(line.n_selectable) ?? raw.length,
    declineAvailable: typeof line.decline_available === "boolean" ? line.decline_available : undefined,
    goldOnHand: num(line.gold_on_hand) ?? undefined,
    options: raw.map((o, i) => ({
      index: num(o.option_index) ?? i,
      kind: str(o.option_kind) ?? "option",
      id: str(o.option_id) ?? "",
      label: str(o.label) ?? undefined,
      grantsRelic: str(o.grants_relic) ?? undefined,
      instanceId: num(o.instance_id) ?? undefined,
      upgraded: (num(o.up) ?? 0) > 0,
      presented: o.presented !== false,
      selectable: o.selectable !== false,
      reason: str(o.selectable_reason) ?? undefined,
      chosen: false,
    })),
    outcome: null,
    resolutions: [],
    s: line.s,
  };
}

function markChoice(dec: ReplayDecision, line: ReplayLine): void {
  const idx = num(line.option_index);
  const byIndex = idx !== null ? dec.options.find((o) => o.index === idx) : undefined;
  if (byIndex) {
    byIndex.chosen = true;
    return;
  }
  const optId = str(line.option_id);
  if (optId) {
    const byId = dec.options.find((o) => o.id === optId);
    if (byId) {
      byId.chosen = true;
      return;
    }
  }
  for (const key of ["c", "from_c"]) {
    const cid = num(line[key]);
    if (cid === null) continue;
    const byInst = dec.options.find((o) => o.instanceId === cid);
    if (byInst) {
      byInst.chosen = true;
      return;
    }
  }
  const rid = str(line.id) ?? str(line.to_id);
  if (rid && line.t !== "buy") {
    const same = dec.options.find((o) => o.id === rid || o.grantsRelic === rid);
    if (same) same.chosen = true;
  }
}

export function parseReplay(text: string): ReplayModel {
  const lines = parseReplayLines(text);
  const header = (lines.find((l) => l.t === "header") ?? {}) as Record<string, unknown>;
  const maps: Record<number, ReplayMap> = {};
  const actNames: Record<number, string> = {};
  const floors: ReplayFloor[] = [];
  const decisions = new Map<number, ReplayDecision>();
  let current: ReplayFloor | null = null;
  let combat: ReplayCombat | null = null;
  let turn: ReplayTurn | null = null;
  let hp: number | null = null;
  let gold: number | null = null;
  let end: Record<string, unknown> | null = null;

  const floorFor = (line: ReplayLine): ReplayFloor | null => {
    const f = num(line.floor);
    if (f === null) return current;
    if (current && current.floor === f) return current;
    return floors.find((x) => x.floor === f) ?? current;
  };

  for (const line of lines) {
    switch (line.t) {
      case "header":
        continue;
      case "act": {
        const a = num(line.act) ?? 1;
        actNames[a] = str(line.name) ?? `Act ${a}`;
        continue;
      }
      case "map": {
        const m = buildMap(line);
        maps[m.act] = m;
        continue;
      }
      case "room": {
        current = {
          floor: num(line.floor) ?? floors.length + 1,
          act: num(line.act) ?? 1,
          kind: (str(line.kind) ?? "unknown").toLowerCase(),
          id: str(line.id),
          coord: parseCoord(line.coord),
          s: line.s,
          lines: [],
          decisions: [],
          combat: null,
          hpAfter: hp,
          goldAfter: gold,
        };
        floors.push(current);
        combat = null;
        turn = null;
        continue;
      }
      case "end":
        end = line as Record<string, unknown>;
        continue;
    }

    const floor = floorFor(line);
    if (floor) floor.lines.push(line);

    if (line.t === "hp") {
      const v = num(line.hp);
      if (v !== null) {
        hp = v;
        if (floor) floor.hpAfter = v;
      }
    } else if (line.t === "gold") {
      const v = num(line.gold);
      if (v !== null) {
        gold = v;
        if (floor) floor.goldAfter = v;
      }
    }

    if (line.t === "combat_start") {
      const rawEnemies = Array.isArray(line.enemies) ? (line.enemies as Record<string, unknown>[]) : [];
      combat = {
        encounter: str(line.encounter) ?? floor?.id ?? "",
        enemies: rawEnemies.map((e, i) => ({
          i: num(e.i) ?? i,
          id: str(e.id) ?? "",
          hp: num(e.hp) ?? 0,
          maxHp: num(e.max_hp) ?? num(e.hp) ?? 0,
        })),
        turns: [],
        result: "",
        turnCount: null,
        damageTaken: 0,
        hpEnd: null,
      };
      turn = null;
      if (floor) floor.combat = combat;
      continue;
    }
    if (combat) {
      if (line.t === "turn") {
        turn = { n: num(line.n) ?? combat.turns.length + 1, side: str(line.side) ?? "player", lines: [] };
        combat.turns.push(turn);
        continue;
      }
      if (line.t === "combat_end") {
        combat.result = str(line.result) ?? "victory";
        combat.turnCount = num(line.turns);
        if (num(line.hp) !== null) combat.hpEnd = num(line.hp);
        combat = null;
        turn = null;
        continue;
      }
      if (line.t === "hp") {
        const d = num(line.d);
        if (d !== null && d < 0) combat.damageTaken -= d;
        combat.hpEnd = num(line.hp);
      }
      if (turn) turn.lines.push(line);
    }

    if (line.t === "decision") {
      const dec = buildDecision(line);
      decisions.set(dec.id, dec);
      if (floor) floor.decisions.push(dec);
      continue;
    }
    if (line.t === "outcome") {
      const dec = decisions.get(num(line.decision_id) ?? -1);
      if (dec) {
        dec.outcome = str(line.outcome);
        markChoice(dec, line);
      }
      continue;
    }
    if (RESOLUTIONS.has(line.t)) {
      const did = num(line.decision_id);
      const dec = did ? decisions.get(did) : undefined;
      if (dec) {
        dec.resolutions.push(line);
        if (line.t === "buy") {
          dec.paid = {
            kind: str(line.kind) ?? "item",
            id: str(line.id) ?? undefined,
            cost: num(line.cost_current) ?? 0,
            resource: str(line.cost_resource) ?? "gold",
          };
          if (str(line.id)) markChoice(dec, line);
        } else {
          markChoice(dec, line);
          if (!dec.outcome) dec.outcome = "chosen";
        }
      }
    }
  }

  if (combat && end) {
    combat.result = str(end.terminal_reason) ?? "unfinished";
    if (num(end.hp) !== null) combat.hpEnd = num(end.hp);
  }
  for (const dec of decisions.values()) {
    if (!dec.outcome) dec.outcome = dec.options.some((o) => o.chosen) ? "chosen" : "unresolved";
  }
  for (const map of Object.values(maps)) {
    completeMap(map, floors.filter((f) => f.act === map.act));
  }

  const deckOf = (v: unknown) =>
    Array.isArray(v)
      ? (v as Record<string, unknown>[])
          .filter((x) => x && typeof x === "object")
          .map((x) => ({ c: num(x.c) ?? -1, id: str(x.id) ?? "" }))
      : [];

  return {
    header,
    end,
    maps,
    floors,
    actNames,
    startingDeck: deckOf(header.starting_deck),
    finalDeck: deckOf(end?.final_deck),
    lineCount: lines.length,
  };
}

/** The journal's map carries the walkable grid only. The game draws the
 * act's Ancient below the first row and the boss above the last, so add
 * both as nodes (unless the recorder already placed the boss), wired to
 * every node on the neighbouring row, and name them from the floors. */
function completeMap(map: ReplayMap, actFloors: ReplayFloor[]): void {
  if (!map.nodes.length) return;
  const rows = map.nodes.map((n) => n[1]);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const centre = (row: number) => {
    const cols = map.nodes.filter((n) => n[1] === row).map((n) => n[0]);
    return Math.round(cols.reduce((a, b) => a + b, 0) / Math.max(1, cols.length));
  };
  if (!map.nodes.some((n) => n[2] === "boss")) {
    const col = centre(maxRow);
    map.nodes.push([col, maxRow + 1, "boss"]);
    for (const n of map.nodes.filter((n) => n[1] === maxRow)) map.edges.push([n[0], n[1], col, maxRow + 1]);
  }
  if (!map.boss) {
    const bossFloor = [...actFloors].reverse().find((f) => isCombatKind(f.kind) && (f.id ?? "").includes("BOSS"));
    if (bossFloor?.id) map.boss = bossFloor.id;
  }
  if (!map.nodes.some((n) => n[2] === "ancient")) {
    const col = centre(minRow);
    map.nodes.push([col, minRow - 1, "ancient"]);
    for (const n of map.nodes.filter((n) => n[1] === minRow)) map.edges.push([col, minRow - 1, n[0], n[1]]);
  }
  if (!map.ancient) {
    const first = actFloors[0];
    if (first && first.kind === "event" && first.id) map.ancient = first.id;
  }
}

/** Rows climb from 0 at the act's first map node. Floors that carry a coord
 * use it; the rest are placed by walking the act's rooms in order and taking
 * the first node on the next row whose kind matches (or any node on that row).
 * Neow and other pre-map rooms get no node. */
export function routeForAct(model: ReplayModel, act: number): Map<number, Coord> {
  const out = new Map<number, Coord>();
  const map = model.maps[act];
  if (!map) return out;
  const rows = new Map<number, MapNode[]>();
  for (const n of map.nodes) {
    const list = rows.get(n[1]) ?? [];
    list.push(n);
    rows.set(n[1], list);
  }
  const firstRow = Math.min(...map.nodes.map((n) => n[1]));
  let nextRow = firstRow;
  let prev: Coord | null = null;
  const edgeSet = new Set(map.edges.map((e) => `${e[0]},${e[1]}>${e[2]},${e[3]}`));
  for (const f of model.floors.filter((x) => x.act === act)) {
    if (f.coord) {
      out.set(f.floor, f.coord);
      prev = f.coord;
      nextRow = f.coord[1] + 1;
      continue;
    }
    const candidates = rows.get(nextRow) ?? [];
    if (!candidates.length) continue;
    const kinds = NODE_KINDS_FOR_ROOM[f.kind] ?? [f.kind];
    const reachable = (n: MapNode) => !prev || edgeSet.has(`${prev[0]},${prev[1]}>${n[0]},${n[1]}`);
    const pick =
      candidates.find((n) => kinds.includes(n[2]) && reachable(n)) ??
      candidates.find((n) => reachable(n)) ??
      candidates.find((n) => kinds.includes(n[2])) ??
      candidates[0];
    const coord: Coord = [pick[0], pick[1]];
    out.set(f.floor, coord);
    prev = coord;
    nextRow += 1;
  }
  return out;
}

export function isCombatKind(kind: string): boolean {
  return COMBAT_KINDS.has(kind);
}
