// Parses the mod's replay journal (newline-delimited JSON, one action per
// line) into the shape the replay page renders: one entry per floor, the act
// maps, the decisions with their offered options and what was picked, and
// each combat broken into turns. Pure: no fetching, no React.
//
// The journal is narrowed once, here, into the discriminated union below.
// Every consumer switches on `t` and gets real fields; nothing downstream
// re-checks types. Unknown record kinds survive as UnknownLine so a newer
// mod build degrades instead of crashing. The journal omits null fields, so
// absence is always "not known", never zero.

import type { Coord, MapEdge, MapNode } from "@/app/live/live-shared";

type Raw = Record<string, unknown>;

interface LineBase {
  s: number;
  ms?: number;
  floor?: number;
  act?: number;
}

export interface DeckCard {
  c: number;
  id: string;
}

export interface HeaderLine extends LineBase {
  t: "header";
  seed?: string;
  startTime?: number;
  buildId?: string;
  character?: string;
  ascension?: number;
  gameMode?: string;
  playerCount?: number;
  modVersion?: string;
  startingDeck: DeckCard[];
}
export interface ActLine extends LineBase {
  t: "act";
  name?: string;
}
export interface MapNodeLine {
  coord: Coord;
  kind: string;
  children: Coord[];
}
export interface MapLine extends LineBase {
  t: "map";
  boss?: string;
  bossCoord?: Coord;
  boss2Coord?: Coord;
  nodes: MapNodeLine[];
}
export interface RoomLine extends LineBase {
  t: "room";
  kind: string;
  id?: string;
  coord?: Coord;
}
export interface DecisionOptionLine {
  optionIndex: number;
  kind: string;
  id: string;
  label?: string;
  desc?: string;
  grantsRelic?: string;
  instanceId?: number;
  up: number;
  presented: boolean;
  selectable: boolean;
  reason?: string;
}
export interface DecisionLine extends LineBase {
  t: "decision";
  decisionId: number;
  decisionType: string;
  source: string;
  selectKind?: string;
  eventId?: string;
  nPresented: number;
  nSelectable: number;
  declineAvailable?: boolean;
  goldOnHand?: number;
  offerGeneration?: number;
  options: DecisionOptionLine[];
}
export interface OutcomeLine extends LineBase {
  t: "outcome";
  decisionId: number;
  outcome?: string;
  optionIndex?: number;
  optionId?: string;
  label?: string;
}
export interface ResolveLine extends LineBase {
  t: "resolve";
  decisionId?: number;
  rewardKind?: string;
  gold?: number;
}
export interface AcquireLine extends LineBase {
  t: "acquire";
  id: string;
  c?: number;
  source?: string;
  decisionId?: number;
  optionIndex?: number;
}
export interface RemoveLine extends LineBase {
  t: "remove";
  id: string;
  c?: number;
  decisionId?: number;
}
export interface UpgradeLine extends LineBase {
  t: "upgrade";
  id: string;
  c?: number;
  decisionId?: number;
}
export interface TransformLine extends LineBase {
  t: "transform";
  fromId: string;
  toId: string;
  fromC?: number;
  toC?: number;
  decisionId?: number;
}
export interface RelicLine extends LineBase {
  t: "relic";
  id: string;
  decisionId?: number;
}
export interface PotionGotLine extends LineBase {
  t: "potion_got";
  id: string;
}
export interface PotionUsedLine extends LineBase {
  t: "potion_used";
  id: string;
}
export interface BuyLine extends LineBase {
  t: "buy";
  kind: string;
  id?: string;
  slot?: number;
  decisionId?: number;
  costCurrent?: number;
  costResource: string;
  goldOnHand?: number;
}
export interface ShopItem {
  slot: number;
  id: string;
  cost?: number;
  stocked: boolean;
  sale: boolean;
  pool?: string;
}
export interface ShopLine extends LineBase {
  t: "shop";
  gold?: number;
  removalCost?: number;
  removalStocked?: boolean;
  cards: ShopItem[];
  relics: ShopItem[];
  potions: ShopItem[];
}
export interface GoldLine extends LineBase {
  t: "gold";
  gold: number;
}
export interface HpLine extends LineBase {
  t: "hp";
  d?: number;
  hp: number;
}
export interface HpLossLine extends LineBase {
  t: "hp_loss";
  dmg?: number;
  blocked?: number;
}
export interface RestLine extends LineBase {
  t: "rest";
  option?: string;
}
export interface CombatEnemy {
  i: number;
  id: string;
  hp: number;
  maxHp: number;
}
export interface CombatStartLine extends LineBase {
  t: "combat_start";
  encounter?: string;
  enemies: CombatEnemy[];
}
export interface CombatEndLine extends LineBase {
  t: "combat_end";
  result?: string;
  turns?: number;
  hp?: number;
}
export interface TurnLine extends LineBase {
  t: "turn";
  n: number;
  side: string;
}
export interface EndTurnLine extends LineBase {
  t: "end_turn";
  n?: number;
  side?: string;
}
export interface DrawLine extends LineBase {
  t: "draw";
  id: string;
  c?: number;
  deckC?: number;
}
export interface PlayLine extends LineBase {
  t: "play";
  id: string;
  c?: number;
  deckC?: number;
  up?: number;
  target?: string;
  costPaid?: number;
  starsPaid?: number;
  auto?: boolean;
}
export interface HitLine extends LineBase {
  t: "hit";
  src?: string;
  dst?: string;
  dmg?: number;
  blocked?: number;
  killed?: boolean;
  card?: string;
}
export interface BlockLine extends LineBase {
  t: "block";
  n?: number;
  card?: string;
}
export interface PowerLine extends LineBase {
  t: "power";
  id: string;
  n?: number;
  tgt?: string;
}
export interface ExhaustLine extends LineBase {
  t: "exhaust";
  id: string;
  c?: number;
  deckC?: number;
}
export interface GenerateLine extends LineBase {
  t: "generate";
  id: string;
  c?: number;
}
export interface ShuffleLine extends LineBase {
  t: "shuffle";
}
export interface ResumeLine extends LineBase {
  t: "resume";
  reloads: number;
  wallClock?: number;
  runTime?: number;
  hp?: number;
  gold?: number;
  deckSize?: number;
}
export interface EndLine extends LineBase {
  t: "end";
  terminalReason?: string;
  runTime?: number;
  floors?: number;
  isGameOver?: boolean;
  hp?: number;
  maxHp?: number;
  finalDeck: DeckCard[];
}
export interface UnknownLine extends LineBase {
  t: "unknown";
  kind: string;
  raw: Raw;
}

export type ReplayLine =
  | HeaderLine
  | ActLine
  | MapLine
  | RoomLine
  | DecisionLine
  | OutcomeLine
  | ResolveLine
  | AcquireLine
  | RemoveLine
  | UpgradeLine
  | TransformLine
  | RelicLine
  | PotionGotLine
  | PotionUsedLine
  | BuyLine
  | ShopLine
  | GoldLine
  | HpLine
  | HpLossLine
  | RestLine
  | CombatStartLine
  | CombatEndLine
  | TurnLine
  | EndTurnLine
  | DrawLine
  | PlayLine
  | HitLine
  | BlockLine
  | PowerLine
  | ExhaustLine
  | GenerateLine
  | ShuffleLine
  | ResumeLine
  | EndLine
  | UnknownLine;

export type ResolutionLine = AcquireLine | RemoveLine | UpgradeLine | TransformLine | RelicLine | ResolveLine | BuyLine;

export interface ReplayOption {
  index: number;
  kind: string;
  id: string;
  label?: string;
  desc?: string;
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
  outcome?: string;
  paid?: { kind: string; id?: string; cost?: number; resource: string };
  resolutions: ResolutionLine[];
  s: number;
}

export interface ReplayTurn {
  n: number;
  side: string;
  lines: ReplayLine[];
}

export interface ReplayCombat {
  encounter: string;
  enemies: CombatEnemy[];
  turns: ReplayTurn[];
  result: string;
  turnCount?: number;
  damageTaken: number;
  hpEnd?: number;
}

export interface ReplayFloor {
  floor: number;
  act: number;
  kind: string;
  id?: string;
  coord?: Coord;
  s: number;
  lines: ReplayLine[];
  decisions: ReplayDecision[];
  combat?: ReplayCombat;
  shop?: ShopLine;
  resumes: ResumeLine[];
  hpAfter?: number;
  goldAfter?: number;
}

export interface ReplayMap {
  act: number;
  nodes: MapNode[];
  edges: MapEdge[];
  boss?: string;
  ancient?: string;
}

export interface ReplayModel {
  header?: HeaderLine;
  end?: EndLine;
  maps: Record<number, ReplayMap>;
  floors: ReplayFloor[];
  actNames: Record<number, string>;
  startingDeck: DeckCard[];
  finalDeck: DeckCard[];
  resumes: ResumeLine[];
  reloads: number;
  lineCount: number;
  malformedLines: number;
}

const COMBAT_KINDS = new Set(["combat", "monster", "burly_monster", "elite", "boss"]);
const NODE_KINDS_FOR_ROOM: Record<string, string[]> = {
  combat: ["monster", "burly_monster", "elite", "boss"],
  monster: ["monster", "burly_monster"],
  burly_monster: ["burly_monster", "monster"],
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

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function objects(v: unknown): Raw[] {
  return Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === "object") : [];
}

const COORD = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/;

export function parseCoord(v: unknown): Coord | undefined {
  if (typeof v !== "string") return undefined;
  const m = COORD.exec(v);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : undefined;
}

function deckOf(v: unknown): DeckCard[] {
  return objects(v).flatMap((x) => {
    const id = str(x.id);
    return id ? [{ c: num(x.c) ?? -1, id }] : [];
  });
}

function shopItems(v: unknown): ShopItem[] {
  return objects(v).map((x, i) => ({
    slot: num(x.slot) ?? i,
    id: str(x.id) ?? "",
    cost: num(x.cost),
    stocked: bool(x.stocked) ?? true,
    sale: bool(x.sale) ?? false,
    pool: str(x.pool),
  }));
}

function narrow(raw: Raw): ReplayLine | undefined {
  const t = str(raw.t);
  const s = num(raw.s);
  if (t === undefined || s === undefined) return undefined;
  const base: LineBase = { s, ms: num(raw.ms), floor: num(raw.floor), act: num(raw.act) };
  const id = str(raw.id) ?? "";
  switch (t) {
    case "header":
      return {
        ...base,
        t,
        seed: str(raw.seed),
        startTime: num(raw.start_time),
        buildId: str(raw.build_id),
        character: str(raw.character),
        ascension: num(raw.ascension),
        gameMode: str(raw.game_mode),
        playerCount: num(raw.player_count),
        modVersion: str(raw.mod_version),
        startingDeck: deckOf(raw.starting_deck),
      };
    case "act":
      return { ...base, t, name: str(raw.name) };
    case "map":
      return {
        ...base,
        t,
        boss: str(raw.boss),
        bossCoord: parseCoord(raw.boss_coord),
        boss2Coord: parseCoord(raw.boss2_coord),
        nodes: objects(raw.nodes).flatMap((n) => {
          const coord = parseCoord(n.coord);
          if (!coord) return [];
          const children = (Array.isArray(n.children) ? n.children : []).map(parseCoord).filter((c): c is Coord => !!c);
          return [{ coord, kind: (str(n.kind) ?? "node").toLowerCase(), children }];
        }),
      };
    case "room":
      return { ...base, t, kind: (str(raw.kind) ?? "unknown").toLowerCase(), id: str(raw.id), coord: parseCoord(raw.coord) };
    case "decision": {
      const options = objects(raw.options).map((o, i) => ({
        optionIndex: num(o.option_index) ?? i,
        kind: str(o.option_kind) ?? "option",
        id: str(o.option_id) ?? "",
        label: str(o.label),
        desc: str(o.desc),
        grantsRelic: str(o.grants_relic),
        instanceId: num(o.instance_id),
        up: num(o.up) ?? 0,
        presented: bool(o.presented) ?? true,
        selectable: bool(o.selectable) ?? true,
        reason: str(o.selectable_reason),
      }));
      return {
        ...base,
        t,
        decisionId: num(raw.decision_id) ?? 0,
        decisionType: str(raw.decision_type) ?? "unknown",
        source: str(raw.source) ?? "",
        selectKind: str(raw.select_kind),
        eventId: str(raw.event_id),
        nPresented: num(raw.n_presented) ?? options.length,
        nSelectable: num(raw.n_selectable) ?? options.length,
        declineAvailable: bool(raw.decline_available),
        goldOnHand: num(raw.gold_on_hand),
        offerGeneration: num(raw.offer_generation),
        options,
      };
    }
    case "outcome":
      return {
        ...base,
        t,
        decisionId: num(raw.decision_id) ?? 0,
        outcome: str(raw.outcome),
        optionIndex: num(raw.option_index),
        optionId: str(raw.option_id),
        label: str(raw.label),
      };
    case "resolve":
      return { ...base, t, decisionId: num(raw.decision_id), rewardKind: str(raw.reward_kind), gold: num(raw.gold) };
    case "acquire":
      return { ...base, t, id, c: num(raw.c), source: str(raw.source), decisionId: num(raw.decision_id), optionIndex: num(raw.option_index) };
    case "remove":
      return { ...base, t, id, c: num(raw.c), decisionId: num(raw.decision_id) };
    case "upgrade":
      return { ...base, t, id, c: num(raw.c), decisionId: num(raw.decision_id) };
    case "transform":
      return {
        ...base,
        t,
        fromId: str(raw.from_id) ?? "",
        toId: str(raw.to_id) ?? "",
        fromC: num(raw.from_c),
        toC: num(raw.to_c),
        decisionId: num(raw.decision_id),
      };
    case "relic":
      return { ...base, t, id, decisionId: num(raw.decision_id) };
    case "potion_got":
      return { ...base, t, id };
    case "potion_used":
      return { ...base, t, id };
    case "buy":
      return {
        ...base,
        t,
        kind: str(raw.kind) ?? "other",
        id: str(raw.id),
        slot: num(raw.slot),
        decisionId: num(raw.decision_id),
        costCurrent: num(raw.cost_current),
        costResource: str(raw.cost_resource) ?? "gold",
        goldOnHand: num(raw.gold_on_hand),
      };
    case "shop":
      return {
        ...base,
        t,
        gold: num(raw.gold),
        removalCost: num(raw.removal_cost),
        removalStocked: bool(raw.removal_stocked),
        cards: shopItems(raw.cards),
        relics: shopItems(raw.relics),
        potions: shopItems(raw.potions),
      };
    case "gold": {
      const gold = num(raw.gold);
      return gold === undefined ? { ...base, t: "unknown", kind: t, raw } : { ...base, t, gold };
    }
    case "hp": {
      const hp = num(raw.hp);
      return hp === undefined ? { ...base, t: "unknown", kind: t, raw } : { ...base, t, d: num(raw.d), hp };
    }
    case "hp_loss":
      return { ...base, t, dmg: num(raw.dmg) ?? num(raw.d), blocked: num(raw.blocked) };
    case "rest":
      return { ...base, t, option: str(raw.option) };
    case "combat_start":
      return {
        ...base,
        t,
        encounter: str(raw.encounter),
        enemies: objects(raw.enemies).map((e, i) => ({
          i: num(e.i) ?? i,
          id: str(e.id) ?? "",
          hp: num(e.hp) ?? 0,
          maxHp: num(e.max_hp) ?? num(e.hp) ?? 0,
        })),
      };
    case "combat_end":
      return { ...base, t, result: str(raw.result), turns: num(raw.turns), hp: num(raw.hp) };
    case "turn":
      return { ...base, t, n: num(raw.n) ?? 0, side: str(raw.side) ?? "player" };
    case "end_turn":
      return { ...base, t, n: num(raw.n), side: str(raw.side) };
    case "draw":
      return { ...base, t, id, c: num(raw.c), deckC: num(raw.deck_c) };
    case "play":
      return {
        ...base,
        t,
        id,
        c: num(raw.c),
        deckC: num(raw.deck_c),
        up: num(raw.up),
        target: str(raw.target),
        costPaid: num(raw.cost_paid),
        starsPaid: num(raw.stars_paid),
        auto: bool(raw.auto),
      };
    case "hit":
      return {
        ...base,
        t,
        src: str(raw.src),
        dst: str(raw.dst),
        dmg: num(raw.dmg),
        blocked: num(raw.blocked),
        killed: bool(raw.killed),
        card: str(raw.card),
      };
    case "block":
      return { ...base, t, n: num(raw.n), card: str(raw.card) };
    case "power":
      return { ...base, t, id, n: num(raw.n), tgt: str(raw.tgt) };
    case "exhaust":
      return { ...base, t, id, c: num(raw.c), deckC: num(raw.deck_c) };
    case "generate":
      return { ...base, t, id, c: num(raw.c) };
    case "shuffle":
      return { ...base, t };
    case "resume":
      return {
        ...base,
        t,
        reloads: num(raw.reloads) ?? 1,
        wallClock: num(raw.wall_clock),
        runTime: num(raw.run_time),
        hp: num(raw.hp),
        gold: num(raw.gold),
        deckSize: num(raw.deck_size),
      };
    case "end":
      return {
        ...base,
        t,
        terminalReason: str(raw.terminal_reason),
        runTime: num(raw.run_time),
        floors: num(raw.floors),
        isGameOver: bool(raw.is_game_over),
        hp: num(raw.hp),
        maxHp: num(raw.max_hp),
        finalDeck: deckOf(raw.final_deck),
      };
    default:
      return { ...base, t: "unknown", kind: t, raw };
  }
}

/** Every well-formed line of the journal, in file order (which is `s`
 * order: the sequence is monotonic across resumes even though `ms` is not).
 * A torn final line is expected after a crash and is not counted; any other
 * unparseable line is counted in `malformed` so the viewer can say the
 * replay has gaps instead of presenting it as complete. */
export function parseReplayLines(text: string): { lines: ReplayLine[]; malformed: number } {
  const out: ReplayLine[] = [];
  const raws = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let malformed = 0;
  raws.forEach((line, i) => {
    try {
      const obj: unknown = JSON.parse(line);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("not a record");
      const typed = narrow(obj as Raw);
      if (typed) out.push(typed);
    } catch {
      if (i < raws.length - 1) malformed += 1;
    }
  });
  return { lines: out, malformed };
}

function buildMap(line: MapLine): ReplayMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  for (const n of line.nodes) {
    nodes.push([n.coord[0], n.coord[1], n.kind]);
    for (const child of n.children) edges.push([n.coord[0], n.coord[1], child[0], child[1]]);
  }
  for (const bc of [line.bossCoord, line.boss2Coord]) {
    if (bc && !nodes.some((n) => n[0] === bc[0] && n[1] === bc[1])) nodes.push([bc[0], bc[1], "boss"]);
  }
  return { act: line.act ?? 1, nodes, edges, boss: line.boss };
}

function buildDecision(line: DecisionLine): ReplayDecision {
  return {
    id: line.decisionId,
    type: line.decisionType,
    source: line.source,
    selectKind: line.selectKind,
    eventId: line.eventId,
    nPresented: line.nPresented,
    nSelectable: line.nSelectable,
    declineAvailable: line.declineAvailable,
    goldOnHand: line.goldOnHand,
    options: line.options.map((o) => ({
      index: o.optionIndex,
      kind: o.kind,
      id: o.id,
      label: o.label,
      desc: o.desc,
      grantsRelic: o.grantsRelic,
      instanceId: o.instanceId,
      upgraded: o.up > 0,
      presented: o.presented,
      selectable: o.selectable,
      reason: o.reason,
      chosen: false,
    })),
    resolutions: [],
    s: line.s,
  };
}

interface ChoiceKeys {
  optionIndex?: number;
  optionId?: string;
  instance?: number;
  id?: string;
}

function choiceKeys(line: OutcomeLine | ResolutionLine): ChoiceKeys {
  switch (line.t) {
    case "outcome":
      return { optionIndex: line.optionIndex, optionId: line.optionId };
    case "acquire":
      return { optionIndex: line.optionIndex, instance: line.c, id: line.id };
    case "remove":
    case "upgrade":
      return { instance: line.c, id: line.id };
    case "transform":
      return { instance: line.fromC, id: line.fromId };
    case "relic":
      return { id: line.id };
    default:
      return {};
  }
}

function markChoice(dec: ReplayDecision, line: OutcomeLine | ResolutionLine): void {
  const keys = choiceKeys(line);
  const byIndex = keys.optionIndex !== undefined ? dec.options.find((o) => o.index === keys.optionIndex) : undefined;
  if (byIndex) {
    byIndex.chosen = true;
    return;
  }
  const byId = keys.optionId ? dec.options.find((o) => o.id === keys.optionId) : undefined;
  if (byId) {
    byId.chosen = true;
    return;
  }
  const byInst = keys.instance !== undefined ? dec.options.find((o) => o.instanceId === keys.instance) : undefined;
  if (byInst) {
    byInst.chosen = true;
    return;
  }
  const same = keys.id ? dec.options.find((o) => o.id === keys.id || o.grantsRelic === keys.id) : undefined;
  if (same) same.chosen = true;
}

function isResolution(line: ReplayLine): line is ResolutionLine {
  return (
    line.t === "acquire" ||
    line.t === "remove" ||
    line.t === "upgrade" ||
    line.t === "transform" ||
    line.t === "relic" ||
    line.t === "resolve" ||
    line.t === "buy"
  );
}

export function parseReplay(text: string): ReplayModel {
  const { lines, malformed } = parseReplayLines(text);
  const header = lines.find((l): l is HeaderLine => l.t === "header");
  const maps: Record<number, ReplayMap> = {};
  const actNames: Record<number, string> = {};
  const floors: ReplayFloor[] = [];
  const resumes: ResumeLine[] = [];
  const decisions = new Map<number, ReplayDecision>();
  let current: ReplayFloor | undefined;
  let combat: ReplayCombat | undefined;
  let turn: ReplayTurn | undefined;
  let hp: number | undefined;
  let gold: number | undefined;
  let end: EndLine | undefined;

  const floorFor = (line: ReplayLine): ReplayFloor | undefined => {
    if (line.floor === undefined) return current;
    const sameAct = (f: ReplayFloor) => line.act === undefined || f.act === line.act;
    if (current && current.floor === line.floor && sameAct(current)) return current;
    return floors.find((x) => x.floor === line.floor && sameAct(x)) ?? current;
  };
  const snapshot = (floor: ReplayFloor | undefined, nextHp?: number, nextGold?: number) => {
    if (nextHp !== undefined) {
      hp = nextHp;
      if (floor) floor.hpAfter = nextHp;
    }
    if (nextGold !== undefined) {
      gold = nextGold;
      if (floor) floor.goldAfter = nextGold;
    }
  };

  for (const line of lines) {
    switch (line.t) {
      case "header":
        continue;
      case "act": {
        const a = line.act ?? 1;
        actNames[a] = line.name ?? `Act ${a}`;
        continue;
      }
      case "map": {
        const m = buildMap(line);
        maps[m.act] = m;
        continue;
      }
      case "room": {
        current = {
          floor: line.floor ?? floors.length + 1,
          act: line.act ?? 1,
          kind: line.kind,
          id: line.id,
          coord: line.coord,
          s: line.s,
          lines: [],
          decisions: [],
          resumes: [],
          hpAfter: hp,
          goldAfter: gold,
        };
        floors.push(current);
        combat = undefined;
        turn = undefined;
        continue;
      }
      case "end":
        end = line;
        continue;
    }

    const floor = floorFor(line);
    if (floor) floor.lines.push(line);

    switch (line.t) {
      case "hp":
        snapshot(floor, line.hp);
        break;
      case "gold":
        snapshot(floor, undefined, line.gold);
        break;
      case "buy":
        if (line.costResource === "gold") snapshot(floor, undefined, line.goldOnHand);
        break;
      case "shop":
        if (floor && !floor.shop) floor.shop = line;
        break;
      case "resume":
        resumes.push(line);
        if (floor) floor.resumes.push(line);
        snapshot(floor, line.hp, line.gold);
        break;
    }

    if (line.t === "combat_start") {
      combat = {
        encounter: line.encounter ?? floor?.id ?? "",
        enemies: line.enemies,
        turns: [],
        result: "",
        damageTaken: 0,
      };
      turn = undefined;
      if (floor) floor.combat = combat;
      continue;
    }
    if (combat) {
      if (line.t === "turn") {
        turn = { n: line.n, side: line.side, lines: [] };
        combat.turns.push(turn);
        continue;
      }
      if (line.t === "combat_end") {
        combat.result = line.result ?? "victory";
        combat.turnCount = line.turns;
        if (line.hp !== undefined) {
          combat.hpEnd = line.hp;
          snapshot(floor, line.hp);
        }
        combat = undefined;
        turn = undefined;
        continue;
      }
      if (line.t === "hp") {
        if (line.d !== undefined && line.d < 0) combat.damageTaken -= line.d;
        combat.hpEnd = line.hp;
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
      const dec = decisions.get(line.decisionId);
      if (dec) {
        dec.outcome = line.outcome;
        markChoice(dec, line);
      }
      continue;
    }
    if (isResolution(line)) {
      const dec = line.decisionId !== undefined ? decisions.get(line.decisionId) : undefined;
      if (dec) {
        dec.resolutions.push(line);
        if (line.t === "buy") {
          dec.paid = { kind: line.kind, id: line.id, cost: line.costCurrent, resource: line.costResource };
          const bySlot = line.slot !== undefined ? dec.options.find((o) => o.index === line.slot) : undefined;
          if (bySlot) bySlot.chosen = true;
        } else {
          markChoice(dec, line);
          if (!dec.outcome) dec.outcome = "chosen";
        }
      }
    }
  }

  if (combat && end) {
    combat.result = end.terminalReason ?? "unfinished";
    if (end.hp !== undefined) combat.hpEnd = end.hp;
  }
  if (end?.hp !== undefined) snapshot(floors[floors.length - 1], end.hp);
  for (const dec of decisions.values()) {
    if (!dec.outcome) dec.outcome = dec.options.some((o) => o.chosen) ? "chosen" : "unresolved";
  }
  for (const map of Object.values(maps)) {
    completeMap(map, floors.filter((f) => f.act === map.act));
  }

  return {
    header,
    end,
    maps,
    floors,
    actNames,
    startingDeck: header?.startingDeck ?? [],
    finalDeck: end?.finalDeck ?? [],
    resumes,
    reloads: resumes.reduce((max, r) => Math.max(max, r.reloads), 0),
    lineCount: lines.length,
    malformedLines: malformed,
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
  const bossNode = map.nodes.find((n) => n[2] === "boss");
  if (!bossNode) {
    const col = centre(maxRow);
    map.nodes.push([col, maxRow + 1, "boss"]);
    for (const n of map.nodes.filter((n) => n[1] === maxRow)) map.edges.push([n[0], n[1], col, maxRow + 1]);
  } else if (!map.edges.some((e) => e[2] === bossNode[0] && e[3] === bossNode[1])) {
    const walkableMax = Math.max(...map.nodes.filter((n) => n[2] !== "boss").map((n) => n[1]));
    for (const n of map.nodes.filter((n) => n[1] === walkableMax)) map.edges.push([n[0], n[1], bossNode[0], bossNode[1]]);
  }
  if (!map.boss) {
    const bossFloor = [...actFloors].reverse().find((f) => isCombatKind(f.kind) && (f.id ?? "").includes("BOSS"));
    if (bossFloor?.id) map.boss = bossFloor.id;
  }
  if (map.act !== 1) return;
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
  const ancientNode = map.nodes.find((n) => n[2] === "ancient");
  const walkable = map.nodes.filter((n) => n[2] !== "ancient");
  let nextRow = Math.min(...(walkable.length ? walkable : map.nodes).map((n) => n[1]));
  let prev: Coord | undefined;
  const edgeSet = new Set(map.edges.map((e) => `${e[0]},${e[1]}>${e[2]},${e[3]}`));
  const actFloors = model.floors.filter((x) => x.act === act);
  for (const f of actFloors) {
    if (f.coord) {
      out.set(f.floor, f.coord);
      prev = f.coord;
      nextRow = f.coord[1] + 1;
      continue;
    }
    if (f === actFloors[0] && ancientNode && f.kind === "event" && f.id === map.ancient) {
      prev = [ancientNode[0], ancientNode[1]];
      out.set(f.floor, prev);
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
