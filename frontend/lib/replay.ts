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
  /** Every option taken, for a decision that allows more than one. An empty
   * array is an explicit decline; absent means no select was open. */
  selectedOptionIndices?: number[];
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
  /** HP the player lost across this fight, where the journal supports a total.
   * Undefined means the journal does not say, which is not the same as zero.
   * Healing does not cancel an earlier loss. */
  hpLost?: number;
  hpEnd?: number;
  /** Stable across a reload that continues this fight, from version 2. */
  combatId?: string;
  /** The reload counter when this fight was recorded, from version 2. */
  attemptId?: number;
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

/** A list of option indices the journal reported. Anything that is not a
 * non-negative safe integer is dropped rather than coerced. */
function indices(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map(count).filter((n): n is number => n !== undefined);
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
        selectedOptionIndices: indices(raw.selected_option_indices),
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
  for (const bc of [line.bossCoord, line.boss2Coord]) {
    if (bc && !nodes.some((n) => n[0] === bc[0] && n[1] === bc[1])) nodes.push([bc[0], bc[1], "boss"]);
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

const DECLINED = new Set(["skip", "decline", "declined", "reroll"]);

/** Settle which options were taken from every record attached to the decision,
 * rather than letting the last line to arrive win. Marks nothing at all when
 * the evidence is ambiguous or contradicts itself. */
function reconcileSelection(dec: ReplayDecision): void {
  const picked = new Set<number>();
  let unresolved = 0;
  for (const line of [...dec.outcomes, ...dec.resolutions]) {
    for (const ev of evidenceFor(line)) {
      const m = matchEvidence(dec, ev);
      if (m === "ambiguous" || m === "unmatched") unresolved += 1;
      else picked.add(m.index);
    }
  }
  // Cardinality is only known where the recorder stated it. An unstated one is
  // not assumed to be single-pick, so two agreeing records are not called a
  // conflict just because the journal did not say how many picks were allowed.
  const multi = dec.maxSelect !== undefined && dec.maxSelect > 1;
  if (picked.size > 1 && dec.maxSelect !== undefined && !multi) {
    dec.selectionStatus = "conflict";
    return;
  }
  if (picked.size) {
    dec.selectionStatus = unresolved ? "partial" : "known";
    for (const o of dec.options) if (picked.has(o.index)) o.chosen = true;
    return;
  }
  // An explicit decline is a recorded fact: the player took nothing.
  const declined = dec.outcomes.some((o) => o.outcome && DECLINED.has(o.outcome));
  const emptySelect = dec.outcomes.some((o) => o.selectedOptionIndices?.length === 0);
  dec.selectionStatus = (declined || emptySelect) && !unresolved ? "known" : "unknown";
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

/** Running HP-loss total for the fight being parsed.
 *
 * `covered` is the whole point. Summing the negative HP deltas is only a total
 * if the journal recorded every HP change in the fight, so every delta is
 * checked against the running HP: a delta that does not carry the snapshot to
 * the value the journal reports means something happened off the record, and
 * the total is abandoned rather than guessed low. `hp_loss` lines are timeline
 * detail and are never added in; they can describe the same event twice. */
interface HpLossTrack {
  lost: number;
  last?: number;
  covered: boolean;
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
        if (floor) floor.resumes.push(line);
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
        combatId: line.combatId,
        attemptId: line.attemptId,
      };
      hpLoss = { lost: 0, last: hp, covered: hp !== undefined };
      turn = undefined;
      if (floor) floor.combats.push(combat);
      continue;
    }
    if (combat) {
      // From version 2 a turn or an end names its fight. One that names a
      // different fight is not folded into this one.
      const named = line.t === "turn" || line.t === "combat_end" ? line.combatId : undefined;
      if (named !== undefined && combat.combatId !== undefined && named !== combat.combatId) {
        if (floor) floor.lines.push(line);
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
        // The recorder's own total wins wherever it exists; below that, a
        // derived one is only offered when every HP change was accounted for.
        combat.hpLost = line.hpLostTotal ?? (hpLoss?.covered ? hpLoss.lost : undefined);
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
          if (line.d === undefined || hpLoss.last === undefined || hpLoss.last + line.d !== line.hp) hpLoss.covered = false;
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

export function isCombatKind(kind: string): boolean {
  return COMBAT_KINDS.has(kind);
}
