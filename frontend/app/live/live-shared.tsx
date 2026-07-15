"use client";

// Shared plumbing for the live presence views: the /live roster, the
// per-player /live/[steamId] breakdown, and the home page rail. Contract:
// markdown-docs/live-presence.md. Every field is optional by design (old
// mod against new backend and vice versa), so everything here renders
// defensively and disappears quietly when data is absent.

import { useEffect, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import { cleanId, displayName } from "../runs/[hash]/RunPills";
import TwitchIcon from "@/app/components/TwitchIcon";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface LiveEvent {
  k: string;
  v?: string;
  turn?: number;
  t?: number;
}

// Spectator act map (v3). nodes: [col, row, type]; edges: [col, row, childCol,
// childRow] linking a node to one a row deeper. (col, row) is the game's grid,
// row = act depth (0 = act start). All optional: absent before the mod ships a
// map, or on an old mod.
export type MapNode = [number, number, string];
export type MapEdge = [number, number, number, number];
export interface LiveMapData {
  act?: number;
  nodes: MapNode[];
  edges: MapEdge[];
}
export type Coord = [number, number];

// Live current-screen detail (v4). event: the room the player is reading, with
// already-localized title/prompt and the options on offer. shop: the merchant
// inventory with per-item cost/sale/stock. Both present only on their screen.
export interface LiveEventOption {
  key?: string;
  text?: string;
  // resolved consequence text ("Lose 3 HP"), a card the option previews (e.g. the
  // card a "lose a card" option will take), and a relic it grants. All optional.
  desc?: string;
  card?: string;
  relic?: string;
  locked?: boolean;
  proceed?: boolean;
  chosen?: boolean;
}
export interface LiveEventCtx {
  id: string;
  title?: string;
  prompt?: string;
  options?: LiveEventOption[];
}
export interface ShopItem {
  id?: string;
  cost?: number;
  stocked?: boolean;
  on_sale?: boolean;
  slot?: string;
}
export interface LiveShop {
  cards?: ShopItem[];
  relics?: ShopItem[];
  potions?: ShopItem[];
  removal?: { cost?: number; stocked?: boolean };
}

// Rest-site options (v7), present only at a campfire: the Rest/Smith/Dig/...
// buttons the player is choosing between. `id` is stable (HEAL/SMITH/...),
// `title` the localized label, `enabled` whether it is selectable.
export interface LiveRestOption {
  id: string;
  title?: string;
  enabled?: boolean;
}

export interface LiveRest {
  options?: LiveRestOption[];
}

// Rich combat enemy (v5) for the spectator combat panel: hp/block plus the
// upcoming intent(s). `intents` is a list because one move can do several things
// (attack + buff). Each intent's `type` is a codex category; `dmg`/`hits`
// describe an attack ("16 ×2"). id or name may be absent on a sparse beat.
export interface EnemyIntent {
  type: string;
  dmg?: number;
  hits?: number;
  // magnitude of a non-attack intent (e.g. the block a defend will gain)
  amount?: number;
}
export interface Enemy {
  id?: string;
  name?: string;
  hp?: number;
  max_hp?: number;
  block?: number;
  intents?: EnemyIntent[];
  // the enemy's buffs/debuffs (vulnerable, weak, strength, ...) for token icons
  powers?: LivePower[];
}

/** A combat buff/debuff on the local player (v6): id + stack amount. */
export interface LivePower {
  id: string;
  amount?: number;
}

/** A channeled orb (v7): id + `passive` (per-turn value) and `evoke` (on-evoke
 * value). Combat-only, orb characters; `orb_slots` is the current capacity. */
export interface LiveOrb {
  id: string;
  passive?: number;
  evoke?: number;
}

/** One route node (v6): a boss/ancient/elite/monster/event in the act, with an
 * optional grid position so it can be matched to the map graph. */
export interface LiveRouteNode {
  id?: string;
  name?: string;
  room_type?: string;
  col?: number;
  row?: number;
  floor?: number;
}

/** The act's route (v6): the boss + ancient and the elite/monster/event nodes. */
export interface LiveRoute {
  boss?: LiveRouteNode;
  ancient?: LiveRouteNode;
  elites?: LiveRouteNode[];
  monsters?: LiveRouteNode[];
  events?: LiveRouteNode[];
}

/** Combat / reward-screen loot on offer (v6). */
export interface LiveLoot {
  gold?: number | null;
  cards?: string[];
  relics?: string[];
  potions?: string[];
  // Scroll-box bundles (v8): each pack is a list of card ids the player picks
  // one whole pack from. Present only on the choose-a-bundle screen; when set,
  // `cards` is empty and the panel shows the packs instead of the flat row.
  packs?: string[][];
  card_removal?: boolean | number;
}

// Death (v7), present once the run ends in a death. `line` is the killer's
// already-localized death quote ("Not quite the top"), `by` the killer's id.
export interface LiveDeath {
  line?: string;
  by?: string;
}

// Floor history (v8): the live mirror of the game's "previous floor" node hover.
// One entry per cleared floor (excludes the floor you're standing on), covering
// the whole run. `rewards` were taken, `skipped` were offered and left behind.
// ids are bare (no CARD./RELIC. prefix). Contract: markdown-docs/live-presence.md.
export interface FloorReward {
  kind: "card" | "relic" | "potion";
  id: string;
}
export interface FloorSummary {
  floor: number;
  act: number;
  type: string; // monster|elite|boss|shop|treasure|restsite|event|ancient|unknown
  encounter_id?: string; // bare enemy/event id; absent for shop/rest/treasure
  hp: number;
  max_hp: number;
  gold: number;
  turns?: number; // combat only
  damage_taken?: number;
  healed?: number;
  gold_spent?: number;
  gold_gained?: number;
  rewards?: FloorReward[];
  skipped?: FloorReward[];
}

/** Co-op per-seat vitals (v6); `is_me` marks the local player's seat. `energy`
 * and `ended_turn` (v8) are combat turn state (0/false outside combat): with the
 * global `turn_side`, they show who is still going vs already locked in. */
export interface LiveSeat {
  character?: string | null;
  hp?: number;
  max_hp?: number;
  block?: number;
  gold?: number;
  energy?: number;
  alive?: boolean;
  ended_turn?: boolean;
  deck_size?: number;
  relic_count?: number;
  potion_count?: number;
  is_me?: boolean;
}

/** A friendly summon in combat (v8): the Necrobinder's Osty and any future pet.
 * `owner` indexes into `players` (0 in single-player). Combat-only. */
export interface LivePet {
  id?: string;
  name?: string;
  hp?: number;
  max_hp?: number;
  block?: number;
  alive?: boolean;
  owner?: number;
}

export interface LivePlayer {
  steam_id: string;
  username?: string | null;
  character?: string | null;
  ascension?: number | null;
  act?: number | null;
  act_floor?: number | null;
  total_floor?: number | null;
  hp?: number | null;
  max_hp?: number | null;
  gold?: number | null;
  screen?: string | null;
  seed?: string | null;
  player_count?: number | null;
  sts2_version?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  turn?: number | null;
  fighting?: string[];
  deck?: string[];
  relics?: string[];
  potions?: string[];
  events?: LiveEvent[];
  map?: LiveMapData | null;
  path?: Coord[];
  pos?: Coord | null;
  event?: LiveEventCtx | null;
  shop?: LiveShop | null;
  rest?: LiveRest | null;
  enemies?: Enemy[] | null;
  // Combat vitals + DPS (v6). `block`/`max_energy` ride the whole run; `energy`,
  // the pile counts, damage, hand, and player_powers are combat-only. See
  // markdown-docs/live-presence.md.
  block?: number | null;
  energy?: number | null;
  max_energy?: number | null;
  draw_count?: number | null;
  discard_count?: number | null;
  exhaust_count?: number | null;
  damage_dealt?: number | null;
  damage_dealt_this_turn?: number | null;
  damage_taken?: number | null;
  biggest_hit?: number | null;
  hand?: string[];
  draw_pile?: string[];
  discard_pile?: string[];
  exhaust_pile?: string[];
  player_powers?: LivePower[];
  orbs?: LiveOrb[] | null;
  orb_slots?: number | null;
  // whose turn it is in combat: "player" / "enemy" (combat-only)
  turn_side?: string | null;
  loot?: LiveLoot | null;
  death?: LiveDeath | null;
  // Per-cleared-floor history for the map's previous-node hover (v8).
  floor_history?: FloorSummary[];
  route?: LiveRoute | null;
  reveals?: Reveal[];
  players?: LiveSeat[];
  // Friendly summons in combat (Necrobinder's Osty, etc.), combat-only (v8).
  pets?: LivePet[] | null;
  run_time?: number | null;
  modifiers?: string[];
  act_name?: string | null;
  // Twitch enrichment from /api/presence (only when the player linked Twitch):
  // their channel, whether they are streaming right now, viewer count, and the
  // curated-partner flag. All optional and absent until the backend attaches them.
  twitch_login?: string | null;
  twitch_live?: boolean;
  twitch_viewers?: number;
  is_partner?: boolean;
}

export interface MonsterInfo {
  id: string;
  name: string;
  image_url?: string | null;
}

export type MonsterMap = Record<string, MonsterInfo>;

/** A per-node map reveal: [col, row, resolved room_type, encounter/event id|null]
 * for a visited node. Same coord space as the map nodes; grows as the player walks. */
export type Reveal = [number, number, string, string | null];

export interface EncounterInfo {
  id: string;
  name?: string;
  monsters?: { id: string; name?: string }[];
}

export type EncounterMap = Record<string, EncounterInfo>;

export function elapsed(startedAt?: string | null): string {
  if (!startedAt) return "";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function ago(unixSeconds?: number): string {
  // `== null` not `!unixSeconds`: a legitimate t of 0 is falsy but valid.
  if (unixSeconds == null) return "";
  const s = Math.floor(Date.now() / 1000 - unixSeconds);
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// Deck entries use the run-doc convention: bare card id, `+` = upgraded.
export function parseDeckId(raw: string): { id: string; upgraded: boolean } {
  const upgraded = raw.endsWith("+");
  return { id: cleanId(upgraded ? raw.slice(0, -1) : raw), upgraded };
}

// Entity ids reach us from the presence API (a game mod) and get spliced
// straight into image URLs and Link hrefs. The backend rejects path-traversal
// ids at the source, but guard here too so a stale backend or a future caller
// can never build a traversal URL.
export function safeId(id: string): boolean {
  return !!id && !id.includes("/") && !id.includes("\\") && !id.includes("..");
}

/** Stable React keys for a list that may hold duplicate ids and that grows or
 * shrinks between polls (deck cards, potions, enemies). Keys by id plus a
 * per-id occurrence ordinal, so appending or removing one item does not
 * reshuffle the keys of the items before it. Plain array-index keys do, which
 * remounts rows on every poll and drops open hover tooltips. */
export function withOrdinalKeys(items: string[]): { item: string; key: string }[] {
  const seen: Record<string, number> = {};
  return items.map((item) => {
    const n = seen[item] ?? 0;
    seen[item] = n + 1;
    return { item, key: `${item}#${n}` };
  });
}

/** A card render for the live views with a three-step source chain: the main
 * (live) render first, then the current beta render (beta players carry cards
 * that don't exist on main yet), then the catalog portrait art (official cards
 * with no full render, e.g. mad_science). An id that resolves through none of
 * those is modded content with no render anywhere, so a MODDED CARD tile
 * stands in instead of a broken image. */
export function LiveCardImg({
  id,
  upgraded = false,
  alt,
  className = "",
  portrait,
}: {
  id: string;
  upgraded?: boolean;
  alt: string;
  className?: string;
  portrait?: string | null;
}) {
  const { lang } = useLanguage();
  // The exhausted-chain marker is keyed by card+lang+chain shape so the tile
  // resets if this slot rerenders as a different card (ordinal keys reuse list
  // positions across polls) or the catalog portrait arrives late.
  const cardKey = `${id}|${upgraded}|${lang}|${portrait ? 1 : 0}`;
  const [failedKey, setFailedKey] = useState("");
  if (!safeId(id) || failedKey === cardKey) {
    return (
      <span
        className={`flex aspect-[10/13] items-center justify-center overflow-hidden rounded-sm border border-dashed border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 text-center ${className}`}
        title={alt}
      >
        <span className="text-[8px] font-bold uppercase leading-tight tracking-wider text-[var(--text-muted)]">
          Modded card
        </span>
      </span>
    );
  }
  const lower = id.toLowerCase();
  const chain = [
    fullCardUrl(lower, upgraded, "stable", lang),
    fullCardUrl(lower, upgraded, "beta", lang),
    ...(portrait ? [imageUrl(portrait)] : []),
  ];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={chain[0]}
      alt={alt}
      className={className}
      crossOrigin="anonymous"
      loading="lazy"
      onError={(e) => {
        const el = e.target as HTMLImageElement;
        const next = chain[chain.indexOf(el.src) + 1];
        if (next) el.src = next;
        else setFailedKey(cardKey);
      }}
    />
  );
}

export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  );
}

/** Curated-partner badge, shown next to a player's name on the live views. */
export function PartnerBadge() {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#9146FF]/15 text-[#b794ff] border border-[#9146FF]/40">
      Partner
    </span>
  );
}

/** "Watch on Twitch" link, shown when a present player is streaming right now.
 * Twitch purple, opens the channel in a new tab; viewer count when known. */
export function WatchOnTwitch({
  login,
  viewers,
  className = "",
}: {
  login: string;
  viewers?: number;
  className?: string;
}) {
  return (
    <a
      href={`https://twitch.tv/${login}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#9146FF] text-white text-xs font-semibold hover:bg-[#7d2ff5] transition-colors ${className}`}
    >
      <TwitchIcon className="w-3.5 h-3.5" />
      Watch on Twitch
      {viewers != null && (
        <span className="font-normal opacity-80">· {viewers.toLocaleString()}</span>
      )}
    </a>
  );
}

/** Poll on an interval, skipping beats while the tab is hidden and firing
 * immediately when it becomes visible again. `fn` must only close over
 * stable values (setState, constants, route params). */
export function usePoll(fn: () => void, ms: number) {
  useEffect(() => {
    fn();
    const t = setInterval(() => {
      if (!document.hidden) fn();
    }, ms);
    const onVis = () => {
      if (!document.hidden) fn();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Lazy monster id -> {name, image_url} map; only fetches once enabled
 * (i.e. once somebody is actually in a fight). */
export function useMonsterMap(enabled: boolean): MonsterMap {
  const { lang } = useLanguage();
  const [map, setMap] = useState<MonsterMap>({});
  useEffect(() => {
    if (!enabled) return;
    cachedFetch<MonsterInfo[]>(`${API}/api/monsters?lang=${lang}`)
      .then((monsters) => {
        const m: MonsterMap = {};
        for (const x of monsters) m[x.id] = x;
        setMap(m);
      })
      .catch(() => {});
  }, [enabled, lang]);
  return map;
}

/** Lazy encounter id -> {name, monsters} map, for resolving a map reveal's
 * encounter id to a representative monster portrait. Fetches once enabled. */
export function useEncounterMap(enabled: boolean): EncounterMap {
  const { lang } = useLanguage();
  const [map, setMap] = useState<EncounterMap>({});
  useEffect(() => {
    if (!enabled) return;
    cachedFetch<EncounterInfo[]>(`${API}/api/encounters?lang=${lang}`)
      .then((encs) => {
        const m: EncounterMap = {};
        for (const x of encs) m[x.id] = x;
        setMap(m);
      })
      .catch(() => {});
  }, [enabled, lang]);
  return map;
}

export function monsterName(id: string, monsters: MonsterMap): string {
  return monsters[cleanId(id)]?.name || displayName(`MONSTER.${id}`);
}

export function EnemyCircle({
  id,
  monsters,
  className = "w-7 h-7",
}: {
  id: string;
  monsters: MonsterMap;
  className?: string;
}) {
  const mid = cleanId(id);
  const info = monsters[mid];
  const fallback = safeId(mid)
    ? imageUrl(`/static/images/monsters/${mid.toLowerCase()}.webp`)
    : "";
  const src = info?.image_url ? imageUrl(info.image_url) : fallback;
  return (
    <span
      className={`relative inline-flex ${className} shrink-0 rounded-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-primary)]`}
      title={monsterName(id, monsters)}
    >
      <img
        src={src}
        alt={monsterName(id, monsters)}
        className="w-full h-full object-cover object-top"
        crossOrigin="anonymous"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    </span>
  );
}

/** "Fighting X · Turn N" with the enemies as small circular portraits.
 * Renders nothing unless the player is actually on the combat screen with
 * known enemies, so stale combat fields from an earlier fight never show. */
export function FightingChip({
  p,
  monsters,
  circle = "w-6 h-6",
}: {
  p: LivePlayer;
  monsters: MonsterMap;
  circle?: string;
}) {
  if (p.screen !== "combat" || !p.fighting?.length) return null;
  // Merge identical enemies (a multi-segment foe like Decimillipede arrives as
  // the same id repeated) into one entry with a count, so the chip stays short.
  const groups: { id: string; count: number }[] = [];
  for (const id of p.fighting) {
    const g = groups.find((x) => x.id === id);
    if (g) g.count += 1;
    else groups.push({ id, count: 1 });
  }
  const names = groups.map((g) => {
    const n = monsterName(g.id, monsters);
    return g.count > 1 ? `${n} ×${g.count}` : n;
  });
  const label =
    names.length <= 2 ? names.join(" & ") : `${names[0]} +${names.length - 1}`;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-2 py-1 rounded-full bg-rose-950/50 border border-rose-900/50 text-xs text-rose-200">
      <span className="flex -space-x-2 shrink-0">
        {withOrdinalKeys(groups.slice(0, 3).map((g) => g.id)).map(({ item, key }) => (
          <EnemyCircle key={key} id={item} monsters={monsters} className={circle} />
        ))}
      </span>
      <span className="min-w-0 truncate">Fighting {label}</span>
      {p.turn != null && p.turn > 0 && (
        <span className="text-rose-400/80 whitespace-nowrap shrink-0">· Turn {p.turn}</span>
      )}
    </span>
  );
}

// One intent as a short colored label. `type` is the codex intent category;
// for attacks `dmg`/`hits` give the incoming damage ("16 ×2").
function intentLabel(it: EnemyIntent): { text: string; cls: string } {
  const kind = (it.type || "").toLowerCase();
  const hits = it.hits && it.hits > 1 ? `×${it.hits}` : "";
  const dmg = it.dmg != null ? `${it.dmg}${hits}` : "";
  const rose = "text-rose-200 bg-rose-950/50 border-rose-900/50";
  const sky = "text-sky-200 bg-sky-950/50 border-sky-900/50";
  const emerald = "text-emerald-200 bg-emerald-950/50 border-emerald-900/50";
  const fuchsia = "text-fuchsia-200 bg-fuchsia-950/50 border-fuchsia-900/50";
  const amber = "text-amber-200 bg-amber-950/50 border-amber-900/50";
  const muted = "text-[var(--text-muted)] bg-[var(--bg-primary)] border-[var(--border-subtle)]";
  switch (kind) {
    case "attack":
      return { text: dmg ? `ATK ${dmg}` : "ATK", cls: rose };
    case "deathblow":
      return { text: dmg ? `LETHAL ${dmg}` : "LETHAL", cls: "text-rose-100 bg-rose-900/60 border-rose-700/60" };
    case "defend":
      return { text: "BLOCK", cls: sky };
    case "buff":
      return { text: "BUFF", cls: emerald };
    case "heal":
      return { text: "HEAL", cls: emerald };
    case "debuff":
      return { text: "DEBUFF", cls: fuchsia };
    case "carddebuff":
      return { text: "CARD", cls: fuchsia };
    case "escape":
      return { text: "FLEE", cls: amber };
    case "summon":
      return { text: "SUMMON", cls: amber };
    case "hidden":
    case "unknown":
      return { text: "?", cls: muted };
    default:
      return { text: kind.toUpperCase(), cls: muted };
  }
}

/** The spectator combat panel: every living enemy with portrait, HP bar, block,
 * and its upcoming intent(s). Uses the rich `enemies` field when the mod sends
 * it, falling back to the bare `fighting` id list (portrait + name only) so it
 * still shows something on an older mod. Gated on enemy data, not the screen:
 * the backend clears enemies/fighting when combat ends, so data presence is the
 * correct gate and the panel naturally disappears after a fight. */
export function LiveEnemiesPanel({ p, monsters }: { p: LivePlayer; monsters: MonsterMap }) {
  const rich = (p.enemies ?? []).filter((e) => e && (e.id || e.name));
  const enemies: Enemy[] = rich.length
    ? rich
    : (p.fighting ?? []).filter(Boolean).map((id) => ({ id }));
  if (!enemies.length) return null;

  return (
    <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Fighting</span>
        {p.turn != null && p.turn > 0 && (
          <span className="ml-auto text-xs text-rose-300 tabular-nums">Turn {p.turn}</span>
        )}
      </div>
      <ul className="space-y-2.5">
        {withOrdinalKeys(enemies.map((e) => e.id || e.name || "?")).map(({ key }, i) => {
          const e = enemies[i];
          const name = e.name || (e.id ? monsterName(e.id, monsters) : "Enemy");
          const hpPct =
            e.hp != null && e.max_hp ? Math.max(0, Math.min(100, (e.hp / e.max_hp) * 100)) : null;
          const intents = e.intents ?? [];
          return (
            <li key={key} className="flex items-center gap-2.5">
              {e.id ? (
                <EnemyCircle id={e.id} monsters={monsters} className="w-10 h-10" />
              ) : (
                <span className="inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-sm text-[var(--text-muted)]">
                  {(name[0] || "?").toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-rose-100 truncate">{name}</span>
                  {(e.block ?? 0) > 0 && (
                    <span className="text-[10px] text-sky-300 tabular-nums shrink-0" title="block">
                      [{e.block}]
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1 shrink-0">
                    {intents.map((it, j) => {
                      const l = intentLabel(it);
                      return (
                        <span
                          key={`${it.type}-${j}`}
                          className={`text-[10px] font-bold rounded border px-1.5 py-0.5 ${l.cls}`}
                        >
                          {l.text}
                        </span>
                      );
                    })}
                  </span>
                </div>
                {hpPct != null ? (
                  <div className="mt-1">
                    <div className="flex justify-between text-[9px] text-rose-300/70 tabular-nums">
                      <span>HP</span>
                      <span>
                        {e.hp}/{e.max_hp}
                      </span>
                    </div>
                    <div className="h-1.5 rounded bg-[var(--bg-primary)]">
                      <div className="h-1.5 rounded bg-rose-500" style={{ width: `${hpPct}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CharacterIcon({
  character,
  className = "w-12 h-12",
}: {
  character?: string | null;
  className?: string;
}) {
  const slug = cleanId(character || "").toLowerCase();
  if (!slug || !safeId(slug)) return null;
  return (
    <img
      src={imageUrl(`/static/images/characters/character_icon_${slug}.webp`)}
      alt={displayName(`CHARACTER.${character ?? ""}`)}
      className={`${className} object-contain`}
      crossOrigin="anonymous"
      onError={(e) => {
        (e.target as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}
