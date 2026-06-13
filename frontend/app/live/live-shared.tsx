"use client";

// Shared plumbing for the live presence views: the /live roster, the
// per-player /live/[steamId] breakdown, and the home page rail. Contract:
// markdown-docs/live-presence.md. Every field is optional by design (old
// mod against new backend and vice versa), so everything here renders
// defensively and disappears quietly when data is absent.

import { useEffect, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import { cleanId, displayName } from "../runs/[hash]/RunPills";

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
}

export interface MonsterInfo {
  id: string;
  name: string;
  image_url?: string | null;
}

export type MonsterMap = Record<string, MonsterInfo>;

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

export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
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
  const names = p.fighting.map((id) => monsterName(id, monsters));
  const label =
    names.length <= 2 ? names.join(" & ") : `${names[0]} +${names.length - 1}`;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-950/50 border border-rose-900/50 text-xs text-rose-200">
      <span className="flex -space-x-2">
        {withOrdinalKeys(p.fighting.slice(0, 3)).map(({ item, key }) => (
          <EnemyCircle key={key} id={item} monsters={monsters} className={circle} />
        ))}
      </span>
      <span className="truncate">Fighting {label}</span>
      {p.turn != null && p.turn > 0 && (
        <span className="text-rose-400/80 whitespace-nowrap">· Turn {p.turn}</span>
      )}
    </span>
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
