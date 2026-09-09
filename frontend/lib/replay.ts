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

import type { Coord, MapEdge, MapNode } from "@/app/[locale]/live/live-shared";

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
  /** The journal format the recorder declared. Capability is read from this
   * number, never sniffed from whether a field happens to be present, so a
   * field the recorder never wrote is distinguishable from one it left out. */
  replayVersion?: number;
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
  ancient?: string;
  bossCoord?: Coord;
  boss2Coord?: Coord;
  ancientCoord?: Coord;
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
  decisionId?: number;
  decisionType: string;
  source: string;
  selectKind?: string;
  eventId?: string;
  nPresented?: number;
  nSelectable?: number;
  declineAvailable?: boolean;
  goldOnHand?: number;
  offerGeneration?: number;
  minSelect?: number;
  maxSelect?: number;
  options: DecisionOptionLine[];
}
export interface OutcomeLine extends LineBase {
  t: "outcome";
  decisionId?: number;
  outcome?: string;
  optionIndex?: number;
  optionId?: string;
  /** Every option taken, for a decision that allows more than one. This is the
   * complete answer where present: an option outside it was not taken. An
   * empty array is an explicit decline; absent means no select was open. */
  selectedOptionIndices?: number[];
  /** The recorder sent a selection list containing something that is not an
   * index, so the list cannot be read as complete or as a decline. */
  selectedOptionIndicesInvalid?: boolean;
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
  optionIndex?: number;
}
export interface UpgradeLine extends LineBase {
  t: "upgrade";
  id: string;
  c?: number;
  decisionId?: number;
  optionIndex?: number;
}
export interface TransformLine extends LineBase {
  t: "transform";
  fromId: string;
  toId: string;
  fromC?: number;
  toC?: number;
  decisionId?: number;
  optionIndex?: number;
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
  combatId?: string;
  attemptId?: number;
}
export interface CombatEndLine extends LineBase {
  t: "combat_end";
  result?: string;
  turns?: number;
  hp?: number;
  combatId?: string;
  attemptId?: number;
  /** Cumulative HP the player actually lost in this fight, from version 2.
   * Excludes blocked damage and is not reduced by healing. Canonical wherever
   * it is present. */
  hpLostTotal?: number;
}
export interface TurnLine extends LineBase {
  t: "turn";
  n: number;
  side: string;
  combatId?: string;
  attemptId?: number;
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
  /** True only where the journal identified this option as taken. False means
   * "not shown as taken", which is a rejection only when selectionStatus is
   * "known"; under any other status it means the record does not say. */
  chosen: boolean;
}

/** How well the journal pins down what was picked.
 * known: every piece of choice evidence resolved, and they agree.
 * partial: at least one option is identified, but some evidence did not resolve.
 * unknown: nothing in the journal identifies an option.
 * conflict: the evidence names different options for a single-pick decision. */
export type SelectionStatus = "known" | "partial" | "unknown" | "conflict";

export interface ReplayDecision {
  id?: number;
  type: string;
  source: string;
  selectKind?: string;
  eventId?: string;
  nPresented?: number;
  nSelectable?: number;
  declineAvailable?: boolean;
  goldOnHand?: number;
  minSelect?: number;
  maxSelect?: number;
  options: ReplayOption[];
  outcome?: string;
  paid?: { kind: string; id?: string; cost?: number; resource: string };
  /** Kept alongside the resolutions so selection is reconciled from all the
   * evidence at once rather than by whichever line happened to arrive last. */
  outcomes: OutcomeLine[];
  resolutions: ResolutionLine[];
  selectionStatus: SelectionStatus;
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
  /** Only what a combat_end reported. A fight the journal never ended has no
   * result: an interrupted fight is not a win, and the run's terminal reason
   * is not this fight's outcome. */
  result?: string;
  /** False where no combat_end arrived, because the journal stopped, the run
   * ended, or another fight started first. */
  endRecorded: boolean;
  turnCount?: number;
  /** HP the player lost across this fight, as the recorder totalled it.
   * Undefined means the journal does not say, which is not the same as zero. */
  hpLost?: number;
  /** What the recorded HP changes add up to, on a journal older than the
   * version that totals it, and only where those changes reconcile end to end.
   * A LOWER BOUND, not a total: two unrecorded changes that cancel each other
   * leave every recorded value consistent, so this cannot prove it saw
   * everything. Never interchangeable with hpLost. */
  hpLossRecorded?: number;
  hpEnd?: number;
  /** Identifies the fight, from version 2. Stable across a reload, so two
   * combats sharing one are attempts at the same fight, not two fights. */
  combatId?: string;
  /** The reload counter when this attempt was recorded, from version 2. */
  attemptId?: number;
  /** A later attempt at this same fight was recorded, so this one was thrown
   * away. The game rebuilds a combat from the encounter on load rather than
   * resuming it, so an abandoned attempt's HP loss was rolled back with it and
   * must never be added to anything. */
  supersededByRetry: boolean;
  /** The journal resumed on this floor after the fight started without
   * finishing, so the reload undid it. This catches the fight that was never
   * attempted again, which no later attempt can mark. */
  rolledBackByReload: boolean;
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
  /** Every fight recorded on this floor, in order. A floor can hold more than
   * one, and the later one used to overwrite the earlier. */
  combats: ReplayCombat[];
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

/** One floor of an act and where it stood, if the journal said. `offMap` marks
 * a recorded coordinate that the recorded map has no node for: it is reported,
 * never moved onto a convenient node. */
export interface RouteEntry {
  floor: ReplayFloor;
  coord?: Coord;
  offMap?: boolean;
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
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** A journal identity or index: a safe integer, or unknown. Never rounded. */
function int(v: unknown): number | undefined {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : undefined;
}

/** A count the journal reported: a non-negative safe integer, or unknown. */
function count(v: unknown): number | undefined {
  const n = int(v);
  return n !== undefined && n >= 0 ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** A list of journal-reported indices. An entry that is not an index makes the
 * whole list unusable rather than shorter: an empty list means "declined
 * explicitly", so silently filtering `[null]` down to `[]` would turn a
 * malformed record into a recorded decision. */
function indices(v: unknown): { values: number[]; invalid: boolean } | undefined {
  if (!Array.isArray(v)) return undefined;
  const parsed = v.map(count);
  return { values: parsed.filter((n): n is number => n !== undefined), invalid: parsed.some((n) => n === undefined) };
}

function objects(v: unknown): Raw[] {
  if (!Array.isArray(v)) return [];
  // Position is identity when a record omits its own index, so an invalid
  // element becomes an empty record instead of shifting everything after it.
  return v.map((x) => (!!x && typeof x === "object" && !Array.isArray(x) ? (x as Raw) : ({} as Raw)));
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
        replayVersion: count(raw.replay_version),
        startingDeck: deckOf(raw.starting_deck),
      };
    case "act":
      return { ...base, t, name: str(raw.name) };
    case "map":
      return {
        ...base,
        t,
        boss: str(raw.boss),
        ancient: str(raw.ancient),
        bossCoord: parseCoord(raw.boss_coord),
        boss2Coord: parseCoord(raw.boss2_coord),
        ancientCoord: parseCoord(raw.ancient_coord),
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
        decisionId: int(raw.decision_id),
        decisionType: str(raw.decision_type) ?? "unknown",
        source: str(raw.source) ?? "",
        selectKind: str(raw.select_kind),
        eventId: str(raw.event_id),
        nPresented: count(raw.n_presented),
        nSelectable: count(raw.n_selectable),
        declineAvailable: bool(raw.decline_available),
        goldOnHand: num(raw.gold_on_hand),
        offerGeneration: num(raw.offer_generation),
        minSelect: count(raw.min_select),
        maxSelect: count(raw.max_select),
        options,
      };
    }
    case "outcome":
      return {
        ...base,
        t,
        decisionId: int(raw.decision_id),
        outcome: str(raw.outcome),
        optionIndex: count(raw.option_index),
        optionId: str(raw.option_id),
        selectedOptionIndices: indices(raw.selected_option_indices)?.values,
        selectedOptionIndicesInvalid: indices(raw.selected_option_indices)?.invalid,
        label: str(raw.label),
      };
    case "resolve":
      return { ...base, t, decisionId: int(raw.decision_id), rewardKind: str(raw.reward_kind), gold: num(raw.gold) };
    case "acquire":
      return { ...base, t, id, c: int(raw.c), source: str(raw.source), decisionId: int(raw.decision_id), optionIndex: count(raw.option_index) };
    case "remove":
      return { ...base, t, id, c: int(raw.c), decisionId: int(raw.decision_id), optionIndex: count(raw.option_index) };
    case "upgrade":
      return { ...base, t, id, c: int(raw.c), decisionId: int(raw.decision_id), optionIndex: count(raw.option_index) };
    case "transform":
      return {
        ...base,
        t,
        fromId: str(raw.from_id) ?? "",
        toId: str(raw.to_id) ?? "",
        fromC: int(raw.from_c),
        toC: int(raw.to_c),
        decisionId: int(raw.decision_id),
        optionIndex: count(raw.option_index),
      };
    case "relic":
      return { ...base, t, id, decisionId: int(raw.decision_id) };
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
        slot: count(raw.slot),
        decisionId: int(raw.decision_id),
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
        combatId: str(raw.combat_id),
        attemptId: count(raw.attempt_id),
        enemies: objects(raw.enemies).map((e, i) => ({
          i: num(e.i) ?? i,
          id: str(e.id) ?? "",
          hp: num(e.hp) ?? 0,
          maxHp: num(e.max_hp) ?? num(e.hp) ?? 0,
        })),
      };
    case "combat_end":
      return {
        ...base,
        t,
        result: str(raw.result),
        turns: count(raw.turns),
        hp: num(raw.hp),
        combatId: str(raw.combat_id),
        attemptId: count(raw.attempt_id),
        hpLostTotal: count(raw.hp_lost_total),
      };
    case "turn":
      return {
        ...base,
        t,
        n: num(raw.n) ?? 0,
        side: str(raw.side) ?? "player",
        combatId: str(raw.combat_id),
        attemptId: count(raw.attempt_id),
      };
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
  // A coordinate the recorder named separately still gets a node when its node
  // list does not already carry one. This places a recorded room, and adds no
  // edges, because the journal is the only thing that knows what it connects to.
  for (const [coord, kind] of [
    [line.bossCoord, "boss"],
    [line.boss2Coord, "boss"],
    [line.ancientCoord, "ancient"],
  ] as const) {
    if (coord && !nodes.some((n) => n[0] === coord[0] && n[1] === coord[1])) nodes.push([coord[0], coord[1], kind]);
  }
  return { act: line.act ?? 1, nodes, edges, boss: line.boss, ancient: line.ancient };
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
    minSelect: line.minSelect,
    maxSelect: line.maxSelect,
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
    outcomes: [],
    resolutions: [],
    selectionStatus: "unknown",
    s: line.s,
  };
}

/** An identity the recorder wrote down to say which option was taken.
 *
 * A card definition id is deliberately absent: it names a card type, and a
 * reward can offer the same type twice. So is an acquired card's instance id,
 * which the choice created rather than offered. Both were previously treated
 * as proof of a pick, which is how a shop that stocks five identical Strikes
 * ended up with the first one marked as the removed card. */
type ChoiceEvidence =
  | { kind: "index"; index: number }
  | { kind: "optionId"; id: string }
  | { kind: "instance"; instance: number }
  | { kind: "slot"; slot: number; itemKind: string };

function evidenceFor(line: OutcomeLine | ResolutionLine): ChoiceEvidence[] {
  const out: ChoiceEvidence[] = [];
  switch (line.t) {
    case "outcome":
      if (line.optionIndex !== undefined) out.push({ kind: "index", index: line.optionIndex });
      for (const i of line.selectedOptionIndices ?? []) out.push({ kind: "index", index: i });
      if (line.optionId) out.push({ kind: "optionId", id: line.optionId });
      break;
    case "acquire":
      // line.c is the instance this acquisition created, not one that was offered.
      if (line.optionIndex !== undefined) out.push({ kind: "index", index: line.optionIndex });
      break;
    case "remove":
    case "upgrade":
      // A deck select offers cards already in the deck, so the instance acted
      // on is an offered identity. Both identifiers are collected so a recorder
      // that disagrees with itself reads as a conflict instead of silently
      // preferring one.
      if (line.optionIndex !== undefined) out.push({ kind: "index", index: line.optionIndex });
      if (line.c !== undefined) out.push({ kind: "instance", instance: line.c });
      break;
    case "transform":
      if (line.optionIndex !== undefined) out.push({ kind: "index", index: line.optionIndex });
      if (line.fromC !== undefined) out.push({ kind: "instance", instance: line.fromC });
      break;
    case "buy":
      // Shop slots are numbered within their item kind, so the kind is part of
      // the identity and a bare slot number is not.
      if (line.slot !== undefined) out.push({ kind: "slot", slot: line.slot, itemKind: line.kind });
      break;
  }
  return out;
}

/** "inapplicable" is not a failure to match. It means the identifier belongs to
 * a namespace this decision's options are not drawn from, so it says nothing
 * either way. An event that upgrades a card as a consequence records the deck
 * instance it upgraded, and that instance was never one of the event's options;
 * counting it as an unmatched pick would downgrade a decision whose choice the
 * outcome line already named exactly. */
type Match = { index: number } | "ambiguous" | "unmatched";

function matchEvidence(dec: ReplayDecision, ev: ChoiceEvidence): Match {
  let hits: ReplayOption[];
  switch (ev.kind) {
    case "index":
      hits = dec.options.filter((o) => o.index === ev.index);
      break;
    case "optionId":
      hits = dec.options.filter((o) => o.id === ev.id);
      break;
    case "instance":
      hits = dec.options.filter((o) => o.instanceId === ev.instance);
      break;
    case "slot":
      hits = dec.options.filter((o) => o.index === ev.slot && o.kind === ev.itemKind);
      break;
  }
  if (hits.length === 1) return { index: hits[0].index };
  return hits.length ? "ambiguous" : "unmatched";
}

/** Whether this record could name one of this decision's options at all.
 *
 * An event offers prose choices, so a card it upgrades or grants is a
 * consequence of the choice rather than another choice: that record neither
 * identifies a pick nor counts as a pick it failed to identify. Everywhere
 * else the record is treated as capable of naming a selection, so a resolution
 * that fails to identify one leaves the decision unsettled instead of being
 * quietly ignored. */
function selectionBearing(dec: ReplayDecision, line: ResolutionLine): boolean {
  switch (line.t) {
    case "acquire":
    case "remove":
    case "upgrade":
    case "transform":
      return !dec.options.every((o) => o.kind === "event_option");
    case "buy":
      // Shop slots are numbered per item kind, so a decision listing no option
      // of that kind is not the list this slot indexes into.
      return dec.options.some((o) => o.kind === line.kind);
    default:
      // A relic line carries only a definition id, and a resolve line is a
      // reward summary. Neither names an option.
      return false;
  }
}

/** What one record says about the selection, after its own identifiers have
 * been reconciled against each other. */
type RecordClaim =
  | { kind: "silent" }
  | { kind: "picked"; index: number }
  | { kind: "exhaustive"; indices: number[] }
  | { kind: "declined" }
  | { kind: "unresolved" }
  | { kind: "contradiction" };

/** Every identifier on one record has to name the same option. A record that
 * names two is a contradiction in the record itself, which stays a conflict
 * even where the decision allowed more than one pick. */
function fromOneRecord(dec: ReplayDecision, ev: ChoiceEvidence[]): RecordClaim {
  const matches = ev.map((e) => matchEvidence(dec, e));
  if (matches.some((m) => m === "ambiguous" || m === "unmatched")) return { kind: "unresolved" };
  const idx = matches.map((m) => (m as { index: number }).index);
  if (!idx.length) return { kind: "unresolved" };
  return idx.every((i) => i === idx[0]) ? { kind: "picked", index: idx[0] } : { kind: "contradiction" };
}

const DECLINED = new Set(["skip", "decline", "declined", "reroll"]);

function claimFor(dec: ReplayDecision, line: OutcomeLine | ResolutionLine): RecordClaim {
  if (line.t === "outcome") {
    if (line.selectedOptionIndicesInvalid) return { kind: "unresolved" };
    const set = line.selectedOptionIndices;
    if (set !== undefined) {
      if (!set.length) return { kind: "declined" };
      const matches = set.map((i) => matchEvidence(dec, { kind: "index", index: i }));
      if (matches.some((m) => m === "ambiguous" || m === "unmatched")) return { kind: "unresolved" };
      return { kind: "exhaustive", indices: matches.map((m) => (m as { index: number }).index) };
    }
    const ev = evidenceFor(line);
    if (!ev.length) return line.outcome && DECLINED.has(line.outcome) ? { kind: "declined" } : { kind: "unresolved" };
    return fromOneRecord(dec, ev);
  }
  if (!selectionBearing(dec, line)) return { kind: "silent" };
  return fromOneRecord(dec, evidenceFor(line));
}

/** Settle which options were taken from every record attached to the decision.
 *
 * Compatible evidence is not the same as complete evidence, and collected
 * evidence is not the same as agreeing evidence, so the records are reconciled
 * against each other rather than poured into one bag. Nothing is marked when
 * they disagree. */
function reconcileSelection(dec: ReplayDecision): void {
  const claims = [...dec.outcomes, ...dec.resolutions].map((l) => claimFor(dec, l));
  const mark = (indexes: number[]) => {
    for (const o of dec.options) if (indexes.includes(o.index)) o.chosen = true;
  };
  if (claims.some((c) => c.kind === "contradiction")) {
    dec.selectionStatus = "conflict";
    return;
  }
  const exhaustive = claims.flatMap((c) => (c.kind === "exhaustive" ? [c.indices] : []));
  const picks = claims.flatMap((c) => (c.kind === "picked" ? [c.index] : []));
  const declined = claims.some((c) => c.kind === "declined");
  const unresolved = claims.filter((c) => c.kind === "unresolved").length;

  // A recorded complete set answers the decision. Anything naming an option
  // outside it, or saying nothing was taken, contradicts it.
  if (exhaustive.length) {
    const first = exhaustive[0];
    const agree = exhaustive.every((e) => e.length === first.length && e.every((i) => first.includes(i)));
    if (!agree || declined || picks.some((p) => !first.includes(p))) {
      dec.selectionStatus = "conflict";
      return;
    }
    mark(first);
    dec.selectionStatus = unresolved ? "partial" : "known";
    return;
  }
  const picked = [...new Set(picks)];
  if (declined) {
    if (picked.length) {
      dec.selectionStatus = "conflict";
      return;
    }
    dec.selectionStatus = unresolved ? "partial" : "known";
    return;
  }
  if (picked.length) {
    if (dec.maxSelect !== undefined && picked.length > dec.maxSelect) {
      dec.selectionStatus = "conflict";
      return;
    }
    // More picks than one where the journal never said how many were allowed:
    // each was identified, so they are kept, but the decision is not called
    // settled. Treating it as single-pick would invent the rule.
    const unstatedMulti = picked.length > 1 && dec.maxSelect === undefined;
    mark(picked);
    dec.selectionStatus = unresolved || unstatedMulti ? "partial" : "known";
    return;
  }
  dec.selectionStatus = "unknown";
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

/** Running total of the HP losses the journal recorded for the fight.
 *
 * `consistent` tracks whether the recorded values reconcile: every delta has to
 * carry the running HP to the value the journal reports, anchored on the HP
 * known before the fight and landing on the HP reported at the end. A delta
 * that does not chain means something happened off the record.
 *
 * Consistency is not completeness, and the difference is why this is only ever
 * reported as a lower bound. A ten-HP loss and a ten-HP heal that the recorder
 * never wrote down leave every recorded value reconciling perfectly while the
 * sum is ten short. `hp_loss` lines are timeline detail and are never added in;
 * they can describe the same event twice. */
interface HpLossTrack {
  lost: number;
  last?: number;
  consistent: boolean;
}

export function parseReplay(text: string): ReplayModel {
  const { lines, malformed } = parseReplayLines(text);
  const header = lines.find((l): l is HeaderLine => l.t === "header");
  const maps: Record<number, ReplayMap> = {};
  const actNames: Record<number, string> = {};
  const floors: ReplayFloor[] = [];
  const resumes: ResumeLine[] = [];
  const decisions = new Map<number, ReplayDecision>();
  const allDecisions: ReplayDecision[] = [];
  let current: ReplayFloor | undefined;
  let combat: ReplayCombat | undefined;
  let hpLoss: HpLossTrack | undefined;
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
          combats: [],
          resumes: [],
          hpAfter: hp,
          goldAfter: gold,
        };
        floors.push(current);
        combat = undefined;
        hpLoss = undefined;
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
        if (floor) {
          floor.resumes.push(line);
          // The game saves at room boundaries, so resuming on this floor put
          // the player back at the start of it. A fight already begun here and
          // never finished was undone, whether or not it was fought again.
          for (const c of floor.combats) if (!c.endRecorded) c.rolledBackByReload = true;
        }
        // The previous session's fight cannot continue into this one.
        combat = undefined;
        hpLoss = undefined;
        turn = undefined;
        snapshot(floor, line.hp, line.gold);
        break;
    }

    if (line.t === "combat_start") {
      // A fight already running is left exactly as recorded, with no end.
      combat = {
        encounter: line.encounter ?? floor?.id ?? "",
        enemies: line.enemies,
        turns: [],
        endRecorded: false,
        supersededByRetry: false,
        rolledBackByReload: false,
        combatId: line.combatId,
        attemptId: line.attemptId,
      };
      hpLoss = { lost: 0, last: hp, consistent: hp !== undefined };
      turn = undefined;
      if (floor) floor.combats.push(combat);
      continue;
    }
    if (combat) {
      // From version 2 a turn or an end names its fight and its attempt. A
      // combat id is deliberately stable across a reload, so the attempt has to
      // be checked too or one attempt's end would close another's fight.
      const tagged = line.t === "turn" || line.t === "combat_end";
      const foreign =
        tagged &&
        ((line.combatId !== undefined && combat.combatId !== undefined && line.combatId !== combat.combatId) ||
          (line.attemptId !== undefined && combat.attemptId !== undefined && line.attemptId !== combat.attemptId));
      if (foreign) {
        // Detach rather than skip. The play and hp lines that follow carry no
        // identity of their own, so leaving this fight active would collect
        // another fight's actions into it.
        combat = undefined;
        hpLoss = undefined;
        turn = undefined;
        continue;
      }
      if (line.t === "turn") {
        turn = { n: line.n, side: line.side, lines: [] };
        combat.turns.push(turn);
        continue;
      }
      if (line.t === "combat_end") {
        // No default result. An end that did not say how the fight went does
        // not make it a win.
        combat.result = line.result;
        combat.endRecorded = true;
        combat.turnCount = line.turns;
        combat.hpLost = line.hpLostTotal;
        // The HP the fight ended on has to agree with the changes recorded
        // during it, or the recorded changes did not cover the whole fight.
        if (hpLoss && line.hp !== undefined && hpLoss.last !== line.hp) hpLoss.consistent = false;
        // From the version that totals HP loss, a missing total means the
        // recorder could not supply one, so nothing is substituted for it.
        // Below that version there is no total to miss, and the recorded losses
        // are offered as the lower bound they are.
        if (hpLoss?.consistent && (header?.replayVersion ?? 1) < 2) combat.hpLossRecorded = hpLoss.lost;
        if (line.hp !== undefined) {
          combat.hpEnd = line.hp;
          snapshot(floor, line.hp);
        }
        combat = undefined;
        hpLoss = undefined;
        turn = undefined;
        continue;
      }
      if (line.t === "hp") {
        if (hpLoss) {
          if (line.d === undefined || hpLoss.last === undefined || hpLoss.last + line.d !== line.hp) hpLoss.consistent = false;
          else if (line.d < 0) hpLoss.lost -= line.d;
          hpLoss.last = line.hp;
        }
        combat.hpEnd = line.hp;
      }
      if (turn) turn.lines.push(line);
    }

    if (line.t === "decision") {
      const dec = buildDecision(line);
      allDecisions.push(dec);
      if (dec.id !== undefined) decisions.set(dec.id, dec);
      if (floor) floor.decisions.push(dec);
      continue;
    }
    if (line.t === "outcome") {
      const dec = line.decisionId !== undefined ? decisions.get(line.decisionId) : undefined;
      if (dec) {
        dec.outcome = line.outcome;
        dec.outcomes.push(line);
      }
      continue;
    }
    if (isResolution(line)) {
      const dec = line.decisionId !== undefined ? decisions.get(line.decisionId) : undefined;
      if (dec) {
        dec.resolutions.push(line);
        if (line.t === "buy") {
          dec.paid = { kind: line.kind, id: line.id, cost: line.costCurrent, resource: line.costResource };
        }
      }
    }
  }

  if (end?.hp !== undefined) snapshot(floors[floors.length - 1], end.hp);
  for (const dec of allDecisions) reconcileSelection(dec);
  // A reload restarts a fight rather than resuming it, so only the last attempt
  // at a given fight is the one that happened.
  for (const floor of floors) {
    for (const c of floor.combats) {
      if (c.combatId === undefined) continue;
      c.supersededByRetry = floor.combats.lastIndexOf(c) < floor.combats.map((x) => x.combatId).lastIndexOf(c.combatId);
    }
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

/** Where the run stood on each floor of an act, in floor order, including the
 * floors whose position the journal never recorded.
 *
 * This used to guess: a floor without a coordinate was placed on the next row
 * by matching room kind, falling back to any reachable node and finally to the
 * first node on the row. That drew a confident route the journal never
 * recorded, and one wrong guess pushed every later floor along with it. */
export function routeForAct(model: ReplayModel, act: number): RouteEntry[] {
  const map = model.maps[act];
  const onMap = new Set((map?.nodes ?? []).map((n) => `${n[0]},${n[1]}`));
  return model.floors
    .filter((f) => f.act === act)
    .map((f) =>
      f.coord ? { floor: f, coord: f.coord, offMap: !onMap.has(`${f.coord[0]},${f.coord[1]}`) } : { floor: f },
    );
}

/** Whether this journal recorded map positions at all.
 *
 * A floor with no position means two different things, and the reader deserves
 * to be told which: a recording that never captured positions, or a recording
 * that captured them and missed this floor. The declared version answers it
 * where it is new enough to promise positions; below that, the journal itself
 * answers it, because the recorder shipped working coordinates one build
 * before it bumped the version. */
export function hasMapPositions(model: ReplayModel): boolean {
  return (model.header?.replayVersion ?? 1) >= 2 || model.floors.some((f) => f.coord !== undefined);
}

/** Whether this fight is part of what happened on its floor. A fight a reload
 * undid is still a recorded thing and still rendered, but it is not counted:
 * every number in it is real, which is what would make the double count hard
 * to see. */
export function combatCounts(c: ReplayCombat): boolean {
  return !c.supersededByRetry && !c.rolledBackByReload;
}

export function isCombatKind(kind: string): boolean {
  return COMBAT_KINDS.has(kind);
}
