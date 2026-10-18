// Rebuilds the live battle scene from a replay journal, one step at a time,
// so a replay can be watched in the same view as /live. Pure: no fetching, no
// React.
//
// Every value on a step comes from a journal line: block from block.left,
// powers from power.amount, energy from energy lines and play.cost_paid, HP
// from hp/max_hp lines and hit damage, card piles from draw_order, draw,
// play.result_pile, discard, exhaust, flush and shuffle. A value the journal
// never stated stays undefined and the scene leaves it out. A created card
// whose pile the journal does not name is listed apart, never guessed into
// the hand.

import type {
  Enemy,
  EnemyIntent,
  LiveEventCtx,
  LiveLoot,
  LivePlayer,
  LivePower,
  LiveShop,
  MapEdge,
  MapNode,
} from "@/app/[locale]/live/live-shared";

type Raw = Record<string, unknown>;

export interface StepDetail {
  k:
    | "hit"
    | "block"
    | "power"
    | "death"
    | "draw"
    | "created"
    | "heal"
    | "exhaust"
    | "discard";
  src?: string;
  dst?: string;
  id?: string;
  n?: number;
  blocked?: number;
  ids?: string[];
}

export interface StepCaption {
  k: string;
  id?: string;
  target?: string;
  src?: string;
  n?: number;
  side?: string;
  label?: string;
  option?: string;
  up?: boolean;
}

export interface SceneStep {
  s: number;
  floor: number;
  act: number;
  caption: StepCaption;
  details: StepDetail[];
  p: LivePlayer;
  /** Cards created this fight whose pile the journal does not name. */
  created: string[];
  /** The cid of the enemy this step acted on, for a highlight. */
  focus?: number;
}

export interface SceneMap {
  act: number;
  nodes: MapNode[];
  edges: MapEdge[];
  boss?: string;
  ancient?: string;
}

interface CardRef {
  id: string;
  up: boolean;
}

interface EnemyState {
  cid: number;
  id: string;
  hp?: number;
  maxHp?: number;
  block?: number;
  powers: Map<string, number>;
  intents?: EnemyIntent[];
  alive: boolean;
}

interface CombatState {
  enemies: Map<number, EnemyState>;
  pending: Map<number, EnemyState>;
  block?: number;
  powers: Map<string, number>;
  energy?: number;
  maxEnergy?: number;
  cards: Map<number, CardRef>;
  hand: number[];
  draw: number[];
  discard: number[];
  exhaust: number[];
  limbo: number[];
  piles: boolean;
  turn?: number;
  side?: string;
  orbs: string[];
  over: boolean;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function list(v: unknown): Raw[] {
  return Array.isArray(v)
    ? v.filter((x): x is Raw => !!x && typeof x === "object")
    : [];
}

function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? v.filter((x): x is number => typeof x === "number")
    : [];
}

function coordOf(v: unknown): [number, number] | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

function deckId(c: CardRef): string {
  return c.up ? `${c.id}+` : c.id;
}

function without(arr: number[], c: number): number[] {
  const i = arr.indexOf(c);
  return i < 0 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
}

const LEAD = new Set([
  "play",
  "potion_start",
  "potion_used",
  "move",
  "end_turn",
  "combat_start",
  "combat_end",
  "room",
  "decision",
  "outcome",
  "rest",
  "buy",
  "resume",
  "relic",
  "relic_lost",
  "potion_got",
  "potion_dropped",
  "acquire",
  "remove",
  "upgrade",
  "transform",
  "pick",
  "resolve",
  "shop",
]);

const SKIP = new Set(["header", "act", "map", "map_room", "event_proceed"]);

export function buildScene(text: string): {
  steps: SceneStep[];
  maps: Record<number, SceneMap>;
} {
  const lines: Raw[] = [];
  for (const row of text.split("\n")) {
    if (!row.trim()) continue;
    try {
      const v: unknown = JSON.parse(row);
      if (v && typeof v === "object" && !Array.isArray(v)) lines.push(v as Raw);
    } catch {
      // a malformed line is counted by the timeline parser, not here
    }
  }

  const maps: Record<number, SceneMap> = {};
  const actNames: Record<number, string> = {};
  const coords = new Map<number, [number, number]>();
  const steps: SceneStep[] = [];

  let character: string | undefined;
  let ascension: number | undefined;
  let hp: number | undefined;
  let maxHp: number | undefined;
  let gold: number | undefined;
  let deck = new Map<number, CardRef>();
  let deckLines = false;
  let relics: string[] = [];
  let potions: (string | null)[] = [];
  let floor = 0;
  let act = 1;
  let screen: string | undefined;
  let combat = null as CombatState | null;
  let pendingPowers = new Map<number, EnemyState>();
  let event = null as LiveEventCtx | null;
  let eventDecision: number | undefined;
  let eventFloor: number | undefined;
  let shop = null as LiveShop | null;
  let shopFloor: number | undefined;
  let loot = null as LiveLoot | null;
  let rest = null as { id: string }[] | null;
  let dead = false;
  let killer: string | undefined;

  let cur = null as SceneStep | null;

  const isPlayer = (who: unknown): boolean =>
    who === "player" ||
    (typeof who === "string" && !!character && who === character);

  const enemyFor = (
    cidRaw: unknown,
    id: unknown,
    create: boolean,
  ): EnemyState | undefined => {
    if (!combat) return undefined;
    const cid = num(cidRaw);
    if (cid !== undefined) {
      let e = combat.enemies.get(cid);
      if (!e && create && typeof id === "string") {
        e = { cid, id, powers: new Map(), alive: true };
        combat.enemies.set(cid, e);
      }
      return e;
    }
    if (typeof id !== "string") return undefined;
    for (const e of combat.enemies.values())
      if (e.id === id && e.alive) return e;
    return undefined;
  };

  const moveCard = (c: number, to: "hand" | "discard" | "exhaust" | null) => {
    if (!combat) return;
    combat.hand = without(combat.hand, c);
    combat.draw = without(combat.draw, c);
    combat.discard = without(combat.discard, c);
    combat.exhaust = without(combat.exhaust, c);
    combat.limbo = without(combat.limbo, c);
    if (to) combat[to] = [...combat[to], c];
  };

  const learnCard = (c: number | undefined, d: Raw) => {
    if (!combat || c === undefined) return;
    const id = str(d.id);
    const known = combat.cards.get(c);
    const up =
      num(d.up) !== undefined ? (num(d.up) ?? 0) > 0 : (known?.up ?? false);
    if (id) combat.cards.set(c, { id, up });
  };

  const ids = (cs: number[]): string[] =>
    cs.flatMap((c) => {
      const card = combat?.cards.get(c);
      return card ? [deckId(card)] : [];
    });

  const routeTo = (): { path: [number, number][]; pos?: [number, number] } => {
    const path: [number, number][] = [];
    const floors = [...coords.keys()].sort((a, b) => a - b);
    for (const f of floors) {
      if (f > floor) break;
      const c = coords.get(f);
      if (c && actOfFloor.get(f) === act) path.push(c);
    }
    return { path, pos: coords.get(floor) };
  };
  const actOfFloor = new Map<number, number>();

  const snapshot = (): LivePlayer => {
    const map = maps[act];
    const { path, pos } = routeTo();
    const p: LivePlayer = {
      steam_id: "",
      character: character ?? null,
      ascension: ascension ?? null,
      act,
      total_floor: floor,
      hp: hp ?? null,
      max_hp: maxHp ?? null,
      gold: gold ?? null,
      screen: screen ?? null,
      deck: [...deck.values()].map(deckId),
      relics,
      potions: potions.filter((x): x is string => !!x),
      act_name: actNames[act] ?? null,
      map: map ? { act, nodes: map.nodes, edges: map.edges } : null,
      path,
      pos: pos ?? null,
      route: map
        ? {
            boss: map.boss ? { id: map.boss } : undefined,
            ancient: map.ancient ? { id: map.ancient } : undefined,
          }
        : null,
      event,
      shop,
      loot,
      rest: rest ? { options: rest } : null,
    };
    if (dead) {
      p.hp = 0;
      p.death = killer ? { by: killer } : {};
    }
    if (combat) {
      const enemies: Enemy[] = [];
      for (const e of combat.enemies.values()) {
        if (!e.alive) continue;
        const powers: LivePower[] = [...e.powers.entries()].map(
          ([id, amount]) => ({ id, amount }),
        );
        enemies.push({
          id: e.id,
          hp: e.hp,
          max_hp: e.maxHp,
          block: e.block,
          intents: e.intents,
          powers,
        });
      }
      p.enemies = enemies;
      p.block = combat.block ?? null;
      p.player_powers = [...combat.powers.entries()].map(([id, amount]) => ({
        id,
        amount,
      }));
      p.energy = combat.energy ?? null;
      p.max_energy = combat.maxEnergy ?? null;
      p.turn = combat.turn ?? null;
      p.turn_side = combat.over ? null : (combat.side ?? null);
      p.orbs = combat.orbs.map((id) => ({ id }));
      if (combat.piles) {
        p.hand = ids(combat.hand);
        p.draw_pile = ids(combat.draw);
        p.discard_pile = ids(combat.discard);
        p.exhaust_pile = ids(combat.exhaust);
        p.draw_count = combat.draw.length;
        p.discard_count = combat.discard.length;
        p.exhaust_count = combat.exhaust.length;
      }
    }
    return p;
  };

  const begin = (d: Raw, caption: StepCaption) => {
    cur = {
      s: num(d.s) ?? (cur?.s ?? 0) + 1,
      floor,
      act,
      caption,
      details: [],
      p: {} as LivePlayer,
      created: [],
    };
    steps.push(cur);
  };

  const detail = (x: StepDetail) => {
    if (!cur) return;
    const last = cur.details[cur.details.length - 1];
    if (x.k === "draw" && last?.k === "draw") {
      last.ids = [...(last.ids ?? []), ...(x.ids ?? [])];
      return;
    }
    cur.details.push(x);
  };

  for (const d of lines) {
    const t = str(d.t) ?? "";
    const f = num(d.floor);
    const a = num(d.act);

    if (t === "header") {
      character = str(d.character) ?? character;
      ascension = num(d.ascension) ?? ascension;
      if (maxHp === undefined) maxHp = num(d.starting_max_hp);
      if (!relics.length) {
        const start = Array.isArray(d.starting_relics)
          ? d.starting_relics.filter((x): x is string => typeof x === "string")
          : [];
        relics = start;
      }
      if (!potions.length) potions = list(d.potions).map(() => null);
      if (!deck.size)
        for (const c of list(d.starting_deck)) {
          const cid = num(c.c);
          const id = str(c.id);
          if (cid !== undefined && id) deck.set(cid, { id, up: false });
        }
      continue;
    }
    if (t === "act") {
      if (a !== undefined && str(d.name)) actNames[a] = str(d.name) as string;
      continue;
    }
    if (t === "map") {
      const mact = a ?? act;
      const nodes: MapNode[] = [];
      const edges: MapEdge[] = [];
      for (const n of list(d.nodes)) {
        const c = coordOf(n.coord);
        if (!c) continue;
        nodes.push([c[0], c[1], str(n.kind) ?? "unknown"]);
        for (const ch of Array.isArray(n.children) ? n.children : []) {
          const cc = coordOf(ch);
          if (cc) edges.push([c[0], c[1], cc[0], cc[1]]);
        }
      }
      maps[mact] = {
        act: mact,
        nodes,
        edges,
        boss: str(d.boss),
        ancient: str(d.ancient),
      };
      continue;
    }

    if (t === "room") {
      if (f !== undefined) floor = f;
      if (a !== undefined) act = a;
      const c = coordOf(d.coord);
      if (c) coords.set(floor, c);
      actOfFloor.set(floor, act);
      const kind = str(d.kind) ?? "";
      screen =
        kind === "combat"
          ? "combat"
          : kind === "restsite"
            ? "rest"
            : kind === "merchant"
              ? "merchant"
              : kind || undefined;
      combat = null;
      if (eventFloor !== floor) {
        event = null;
        eventDecision = undefined;
      }
      if (shopFloor !== floor) shop = null;
      loot = null;
      rest = null;
    } else {
      if (t === "resume" && f !== undefined) floor = f;
      else if (f !== undefined && f > floor) {
        floor = f;
        actOfFloor.set(floor, a ?? act);
      }
      if (a !== undefined) act = a;
    }

    if (SKIP.has(t)) continue;

    switch (t) {
      case "room":
        begin(d, { k: "room", id: str(d.id), label: str(d.kind) });
        break;
      case "deck": {
        const next = new Map<number, CardRef>();
        for (const c of list(d.cards)) {
          const cid = num(c.c);
          const id = str(c.id);
          if (cid !== undefined && id)
            next.set(cid, { id, up: (num(c.up) ?? 0) > 0 });
        }
        deck = next;
        deckLines = true;
        break;
      }
      case "gold":
        gold = num(d.gold) ?? gold;
        break;
      case "hp": {
        const v = num(d.hp);
        if (v === undefined) break;
        const target = d.dst;
        if (target === undefined ? d.mine !== false : isPlayer(target)) {
          const before = hp;
          hp = v;
          if (str(d.src) === "heal" && floor > 0) {
            if (!cur || cur.floor !== floor) begin(d, { k: "heal" });
            detail({
              k: "heal",
              dst: "player",
              n: before !== undefined ? v - before : num(d.d),
            });
          }
        } else {
          const e = enemyFor(d.dst_cid, target, true);
          if (e) e.hp = v;
        }
        break;
      }
      case "max_hp": {
        if (isPlayer(d.dst)) {
          maxHp = num(d.max_hp) ?? maxHp;
          hp = num(d.hp) ?? hp;
        } else {
          const e = enemyFor(d.dst_cid, d.dst, true);
          if (e) {
            e.maxHp = num(d.max_hp) ?? e.maxHp;
            e.hp = num(d.hp) ?? e.hp;
          }
        }
        break;
      }
      case "relic": {
        const id = str(d.id);
        if (id) relics = [...relics, id];
        begin(d, { k: "relic", id });
        break;
      }
      case "relic_lost": {
        const id = str(d.id);
        const i = id ? relics.indexOf(id) : -1;
        if (i >= 0) relics = [...relics.slice(0, i), ...relics.slice(i + 1)];
        begin(d, { k: "relic_lost", id });
        break;
      }
      case "potion_got": {
        const id = str(d.id);
        if (id) {
          const i = potions.indexOf(null);
          potions =
            i >= 0
              ? potions.map((x, j) => (j === i ? id : x))
              : [...potions, id];
        }
        begin(d, { k: "potion_got", id });
        break;
      }
      case "potion_start":
      case "potion_used":
      case "potion_dropped": {
        const id = str(d.id);
        const already =
          t === "potion_used" &&
          cur?.caption.k === "potion" &&
          cur.caption.id === id;
        if (t !== "potion_start" && id) {
          const i = potions.indexOf(id);
          if (i >= 0) potions = potions.map((x, j) => (j === i ? null : x));
        }
        if (!already)
          begin(d, {
            k: t === "potion_dropped" ? "potion_dropped" : "potion",
            id,
            target: isPlayer(d.target) ? undefined : str(d.target),
          });
        if (cur) cur.focus = num(d.target_cid) ?? cur.focus;
        break;
      }
      case "resume": {
        hp = num(d.hp) ?? hp;
        gold = num(d.gold) ?? gold;
        const rs = list(d.relics);
        if (rs.length)
          relics = rs.flatMap((r) => (str(r.id) ? [str(r.id) as string] : []));
        const ps = list(d.potions);
        if (Array.isArray(d.potions))
          potions = ps.map((x) => str(x.id) ?? null);
        combat = null;
        begin(d, { k: "resume" });
        break;
      }
      case "remap": {
        const pairs = list(d.cards).flatMap((x) => {
          const from = num(x.from);
          const to = num(x.to);
          return from !== undefined && to !== undefined ? [[from, to]] : [];
        });
        const next = new Map<number, CardRef>();
        const m = new Map(pairs as [number, number][]);
        for (const [c, card] of deck) next.set(m.get(c) ?? c, card);
        deck = next;
        break;
      }
      case "acquire":
      case "remove":
      case "upgrade":
      case "transform": {
        if (!deckLines) {
          const c = num(d.c);
          const id = str(d.id);
          if (t === "acquire" && c !== undefined && id)
            deck.set(c, { id, up: false });
          if (t === "remove" && c !== undefined) deck.delete(c);
          if (t === "upgrade" && c !== undefined) {
            const card = deck.get(c);
            if (card) deck.set(c, { ...card, up: true });
          }
          if (t === "transform") {
            const from = num(d.from_c);
            const to = num(d.to_c);
            const toId = str(d.to_id);
            if (from !== undefined) deck.delete(from);
            if (to !== undefined && toId) deck.set(to, { id: toId, up: false });
          }
          deck = new Map(deck);
        }
        begin(d, {
          k: t,
          id: t === "transform" ? str(d.to_id) : str(d.id),
          src: t === "transform" ? str(d.from_id) : undefined,
        });
        break;
      }
      case "combat_start": {
        const enemies = new Map<number, EnemyState>();
        for (const e of list(d.enemies)) {
          const cid = num(e.cid) ?? num(e.i) ?? enemies.size;
          const id = str(e.id) ?? "";
          const pre = pendingPowers.get(cid);
          enemies.set(cid, {
            cid,
            id,
            hp: num(e.hp),
            maxHp: num(e.max_hp),
            block: pre?.block,
            powers: pre?.powers ?? new Map(),
            alive: true,
          });
        }
        combat = {
          enemies,
          pending: new Map(),
          powers: new Map(),
          cards: new Map(),
          hand: [],
          draw: [],
          discard: [],
          exhaust: [],
          limbo: [],
          piles: false,
          orbs: [],
          over: false,
        };
        pendingPowers = new Map();
        screen = "combat";
        loot = null;
        begin(d, { k: "combat_start", id: str(d.encounter) });
        break;
      }
      case "draw_order": {
        if (!combat) break;
        const order = nums(d.order_c);
        const origin = nums(d.order_deck_c);
        order.forEach((c, i) => {
          const card = deck.get(origin[i]);
          if (card) combat?.cards.set(c, { ...card });
        });
        combat.draw = order;
        combat.piles = true;
        break;
      }
      case "energy": {
        if (!combat) break;
        if (str(d.src) === "turn") {
          combat.side = "player";
          combat.turn = num(d.n) ?? combat.turn;
          begin(d, { k: "turn", n: num(d.n), side: "player" });
        }
        combat.energy = num(d.energy) ?? combat.energy;
        combat.maxEnergy = num(d.max) ?? combat.maxEnergy;
        break;
      }
      case "draw": {
        const c = num(d.c);
        learnCard(c, d);
        if (combat && c !== undefined) {
          if (!combat.cards.has(c) && str(d.id))
            combat.cards.set(c, { id: str(d.id) as string, up: false });
          moveCard(c, "hand");
        }
        detail({ k: "draw", ids: str(d.id) ? [str(d.id) as string] : [] });
        break;
      }
      case "turn": {
        if (!combat) break;
        const side = str(d.side);
        combat.side = side;
        combat.turn = num(d.n) ?? combat.turn;
        if (cur?.caption.k === "turn" && cur.caption.side === side) {
          cur.caption.n = num(d.n);
        } else {
          begin(d, { k: "turn", n: num(d.n), side });
        }
        break;
      }
      case "end_turn": {
        if (!combat) break;
        if (cur?.caption.k === "end_turn" && cur.caption.side === undefined) {
          cur.caption.n = num(d.n);
          cur.caption.side = str(d.side);
        } else {
          begin(d, { k: "end_turn", n: num(d.n), side: str(d.side) });
        }
        break;
      }
      case "intent": {
        const e = enemyFor(d.src_cid, d.src, true);
        if (!e) break;
        if (d.at === "turn_end" && cur?.caption.k !== "end_turn")
          begin(d, { k: "end_turn" });
        const types = Array.isArray(d.intents)
          ? d.intents.filter((x): x is string => typeof x === "string")
          : [];
        e.intents = types.map((type) =>
          type === "attack"
            ? { type, dmg: num(d.dmg), hits: num(d.hits) }
            : { type },
        );
        break;
      }
      case "move": {
        const e = enemyFor(d.src_cid, d.src, true);
        begin(d, { k: "move", src: str(d.src), id: str(d.id) });
        if (cur && e) cur.focus = e.cid;
        break;
      }
      case "play": {
        const c = num(d.c);
        learnCard(c, d);
        const pile = str(d.result_pile);
        if (combat && c !== undefined) {
          if (!combat.cards.has(c) && str(d.id))
            combat.cards.set(c, {
              id: str(d.id) as string,
              up: (num(d.up) ?? 0) > 0,
            });
          moveCard(
            c,
            pile === "discard"
              ? "discard"
              : pile === "exhaust"
                ? "exhaust"
                : null,
          );
          const cost = num(d.cost_paid);
          if (combat.energy !== undefined && cost !== undefined)
            combat.energy = Math.max(0, combat.energy - cost);
        }
        begin(d, {
          k: "play",
          id: str(d.id),
          up: (num(d.up) ?? 0) > 0,
          target: isPlayer(d.target) ? undefined : str(d.target),
        });
        if (cur) cur.focus = num(d.target_cid);
        break;
      }
      case "discard":
      case "exhaust": {
        const c = num(d.c);
        learnCard(c, d);
        if (combat && c !== undefined) moveCard(c, t);
        if (str(d.id)) detail({ k: t, id: str(d.id) });
        break;
      }
      case "flush": {
        if (!combat) break;
        if (cur?.caption.k !== "end_turn") begin(d, { k: "end_turn" });
        for (const c of nums(d.flushed_c)) moveCard(c, "discard");
        break;
      }
      case "shuffle": {
        if (!combat) break;
        const order = nums(d.order_c);
        if (order.length) {
          combat.discard = combat.discard.filter((c) => !order.includes(c));
          combat.draw = [...order];
        } else {
          combat.draw = [...combat.draw, ...combat.discard];
          combat.discard = [];
        }
        break;
      }
      case "generate": {
        const c = num(d.c);
        learnCard(c, d);
        if (combat && c !== undefined) {
          moveCard(c, null);
          combat.limbo = [...combat.limbo, c];
        }
        if (str(d.id)) detail({ k: "created", ids: [str(d.id) as string] });
        break;
      }
      case "pick":
        break;
      case "block": {
        const left = num(d.left);
        const n = num(d.n);
        if (isPlayer(d.src) && !num(d.src_cid)) {
          if (combat) combat.block = left ?? (combat.block ?? 0) + (n ?? 0);
          if (d.reason === "gained" && n)
            detail({ k: "block", dst: "player", n });
        } else {
          const e = enemyFor(d.src_cid, d.src, false);
          if (e) e.block = left ?? (e.block ?? 0) + (n ?? 0);
          else if (num(d.src_cid) !== undefined) {
            const cid = num(d.src_cid) as number;
            const pre: EnemyState = pendingPowers.get(cid) ?? {
              cid,
              id: str(d.src) ?? "",
              powers: new Map(),
              alive: true,
            };
            pre.block = left ?? (pre.block ?? 0) + (n ?? 0);
            pendingPowers.set(cid, pre);
          }
          if (d.reason === "gained" && n)
            detail({ k: "block", dst: str(d.src), n });
        }
        break;
      }
      case "power":
      case "power_lost": {
        const id = str(d.id);
        if (!id) break;
        const amount = num(d.amount);
        const n = num(d.n);
        const apply = (m: Map<string, number>) => {
          const next = amount ?? (m.get(id) ?? 0) + (n ?? 0);
          if (next === 0) m.delete(id);
          else m.set(id, next);
        };
        if (d.post_combat) break;
        if (num(d.tgt_cid) === undefined && isPlayer(d.tgt)) {
          if (combat) apply(combat.powers);
          if (t === "power" && d.src !== "effect")
            detail({ k: "power", dst: "player", id, n });
        } else {
          const e = enemyFor(d.tgt_cid, d.tgt, false);
          if (e) apply(e.powers);
          else if (num(d.tgt_cid) !== undefined && !combat) {
            const cid = num(d.tgt_cid) as number;
            const pre: EnemyState = pendingPowers.get(cid) ?? {
              cid,
              id: str(d.tgt) ?? "",
              powers: new Map(),
              alive: true,
            };
            apply(pre.powers);
            pendingPowers.set(cid, pre);
          }
          if (t === "power" && d.src !== "effect" && combat)
            detail({ k: "power", dst: str(d.tgt), id, n });
        }
        break;
      }
      case "hit": {
        const dmg = num(d.dmg) ?? 0;
        const blocked = num(d.blocked) ?? 0;
        if (num(d.dst_cid) === undefined && isPlayer(d.dst)) {
          if (hp !== undefined) hp = Math.max(0, hp - dmg);
          if (combat && combat.block !== undefined)
            combat.block = Math.max(0, combat.block - blocked);
          detail({ k: "hit", src: str(d.src), dst: "player", n: dmg, blocked });
        } else {
          const e = enemyFor(d.dst_cid, d.dst, false);
          if (e) {
            if (e.hp !== undefined) e.hp = Math.max(0, e.hp - dmg);
            if (e.block !== undefined) e.block = Math.max(0, e.block - blocked);
          }
          detail({
            k: "hit",
            src: str(d.src),
            dst: str(d.dst),
            n: dmg,
            blocked,
          });
        }
        break;
      }
      case "death": {
        if (num(d.tgt_cid) === undefined && isPlayer(d.tgt)) {
          if (d.killed_by === "RUN_MANAGER") break;
          dead = true;
          killer = str(d.killed_by);
          detail({ k: "death", dst: "player" });
        } else {
          const e = enemyFor(d.tgt_cid, d.tgt, false);
          if (e) {
            e.alive = false;
            e.hp = 0;
          }
          detail({ k: "death", dst: str(d.tgt) });
        }
        break;
      }
      case "orb_channel": {
        const id = str(d.id);
        if (combat && id) combat.orbs = [...combat.orbs, id];
        break;
      }
      case "orb_evoke": {
        const id = str(d.id);
        if (combat && id) {
          const i = combat.orbs.indexOf(id);
          if (i >= 0)
            combat.orbs = [
              ...combat.orbs.slice(0, i),
              ...combat.orbs.slice(i + 1),
            ];
        }
        break;
      }
      case "combat_end": {
        if (combat) {
          combat.over = true;
          combat.block = undefined;
          combat.hand = [];
        }
        begin(d, { k: "combat_end", label: str(d.result), n: num(d.turns) });
        break;
      }
      case "decision": {
        const type = str(d.decision_type) ?? "";
        const opts = list(d.options);
        if (type === "event") {
          eventDecision = num(d.decision_id);
          eventFloor = floor;
          event = {
            id: str(d.event_id) ?? "",
            options: opts.map((o) => ({
              key: str(o.option_id),
              text: str(o.label),
              desc: str(o.desc),
              relic: str(o.grants_relic),
              card: str(o.grants_card),
              locked: o.selectable === false,
            })),
          };
          screen = "event";
        } else if (type === "card_reward" || type === "relic_reward") {
          const offered = opts.flatMap((o) => {
            const id = str(o.option_id);
            if (!id) return [];
            return [(num(o.up) ?? 0) > 0 ? `${id}+` : id];
          });
          loot = {
            ...(loot ?? {}),
            ...(type === "card_reward"
              ? { cards: offered }
              : { relics: [...(loot?.relics ?? []), ...offered] }),
          };
        } else if (type === "treasure") {
          loot = {
            relics: opts.flatMap((o) =>
              str(o.option_id) ? [str(o.option_id) as string] : [],
            ),
          };
        } else if (type === "rest") {
          rest = opts.flatMap((o) =>
            str(o.option_id)
              ? [{ id: (str(o.option_id) as string).toUpperCase() }]
              : [],
          );
          screen = "rest";
        }
        begin(d, { k: "decision", label: type, id: str(d.event_id) });
        break;
      }
      case "outcome": {
        const type = str(d.decision_type) ?? "";
        if (type === "event" && event && num(d.decision_id) === eventDecision) {
          const idx = num(d.option_index);
          event = {
            ...event,
            options: (event.options ?? []).map((o, i) => ({
              ...o,
              chosen: i === idx,
            })),
          };
        }
        begin(d, {
          k: "outcome",
          label: type,
          option: str(d.label) ?? str(d.option_id),
          src: str(d.outcome),
        });
        break;
      }
      case "resolve": {
        const kind = str(d.reward_kind);
        if (kind === "GoldReward" && loot)
          loot = { ...loot, gold: num(d.gold) ?? loot.gold };
        if (kind === "PotionReward" && loot && str(d.id))
          loot = {
            ...loot,
            potions: [...(loot.potions ?? []), str(d.id) as string],
          };
        begin(d, { k: "resolve", label: kind, id: str(d.id), n: num(d.gold) });
        break;
      }
      case "shop": {
        const items = (v: unknown) =>
          list(v).map((x) => ({
            id: str(x.id),
            cost: num(x.cost),
            stocked: x.stocked !== false,
            on_sale: x.sale === true,
            slot: num(x.slot) !== undefined ? String(x.slot) : undefined,
          }));
        shop = {
          cards: items(d.cards),
          relics: items(d.relics),
          potions: items(d.potions),
          removal: {
            cost: num(d.removal_cost),
            stocked: d.removal_stocked !== false,
          },
        };
        screen = "merchant";
        shopFloor = floor;
        if (!cur || cur.floor !== floor) begin(d, { k: "shop" });
        break;
      }
      case "buy":
        begin(d, {
          k: "buy",
          id: str(d.id),
          label: str(d.kind),
          n: num(d.cost_current),
        });
        break;
      case "rest":
        begin(d, { k: "rest", option: str(d.option) });
        break;
      case "end":
        break;
      default:
        if (LEAD.has(t)) begin(d, { k: t, id: str(d.id) });
    }

    if (cur) {
      cur.p = snapshot();
      cur.created = combat ? ids(combat.limbo) : [];
    }
  }

  return { steps: steps.filter((st) => st.floor > 0), maps };
}
