"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Epoch } from "@/lib/api/types";
import { isBetaRow } from "@/lib/beta-row";
import RichDescription from "@/app/components/RichDescription";
import { CDN_BASE, fullCardUrl, imageUrl } from "@/lib/image-url";

export interface UnlockItem {
  id: string;
  name: string;
  image_url?: string | null;
  description?: string | null;
  epoch_id?: string;
  unlock_info?: string | null;
}

export interface UnlocksPayload {
  characters: UnlockItem[];
  cards: UnlockItem[];
  relics: UnlockItem[];
  potions: UnlockItem[];
}

export function unlockInfoByEpoch(
  data: UnlocksPayload | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const list of [data.cards, data.relics, data.potions]) {
    for (const item of list || []) {
      if (item.epoch_id && item.unlock_info && !out[item.epoch_id]) {
        out[item.epoch_id] = item.unlock_info;
      }
    }
  }
  return out;
}

export interface EpochUnlocks {
  characters: UnlockItem[];
  cards: UnlockItem[];
  relics: UnlockItem[];
  potions: UnlockItem[];
}

export interface EraGroup {
  key: string;
  name: string;
  year: string | null;
  epochs: Epoch[];
}

const CHARACTER_STORIES = new Set([
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
  "fool",
]);

const storyAccent: Record<string, string> = {
  ironclad: "text-danger",
  silent: "text-success",
  defect: "text-info",
  necrobinder: "text-special",
  regent: "text-warning",
  fool: "text-[var(--text-fool)]",
  magnumopus: "text-special",
  talesfromthespire: "text-info",
  reopening: "text-warning",
};

export function storyKey(id: string | null | undefined): string {
  return (id || "").toLowerCase().replace(/_/g, "");
}

export function storyAccentClass(id: string | null | undefined): string {
  return storyAccent[storyKey(id)] || "text-[var(--accent-gold)]";
}

export function prettyId(id: string): string {
  return id
    .replace(/_EPOCH$/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function eraKey(era: string | null | undefined): string {
  return (era || "").replace(/\d+$/, "");
}

export function eraLabels(
  all: Epoch[],
): Record<string, { name: string; year: string | null }> {
  const out: Record<string, { name: string; year: string | null }> = {};
  for (const e of all) {
    const key = eraKey(e.era);
    if (!out[key] && e.era_name) {
      out[key] = { name: e.era_name, year: e.era_year };
    }
  }
  return out;
}

export function groupByEra(shown: Epoch[], all: Epoch[]): EraGroup[] {
  const labels = eraLabels(all);
  const groups: EraGroup[] = [];
  const byKey = new Map<string, EraGroup>();
  for (const e of [...shown].sort((a, b) => a.sort_order - b.sort_order)) {
    const key = eraKey(e.era);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        name: labels[key]?.name || key,
        year: labels[key]?.year ?? null,
        epochs: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.epochs.push(e);
  }
  return groups;
}

export function StoryLabel({
  storyId,
  name,
}: {
  storyId: string | null | undefined;
  name?: string;
}) {
  if (!storyId) return null;
  const key = storyKey(storyId);
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${storyAccentClass(storyId)}`}
    >
      {CHARACTER_STORIES.has(key) && (
        <img
          src={`${CDN_BASE}/ui/characters/character_icon_${key}.webp`}
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 object-contain shrink-0"
          crossOrigin="anonymous"
          loading="lazy"
        />
      )}
      {name || prettyId(storyId)}
    </span>
  );
}

const tileBase =
  "group/tile relative flex flex-col items-center gap-1.5 text-center leading-tight text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors";
const tileClass = `${tileBase} w-[88px] text-[13px]`;
const tileClassLarge = `${tileBase} w-[100px] text-sm sm:w-[132px]`;

function Popover({ item }: { item: UnlockItem }) {
  if (!item.description) return null;
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-left text-[13px] leading-snug text-[var(--text-secondary)] shadow-lg group-hover/tile:block">
      <RichDescription text={item.description.replace(/\{[^}]+\}/g, "X")} />
    </span>
  );
}

function CardTile({
  item,
  lang,
  large,
}: {
  item: UnlockItem;
  lang: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const render = fullCardUrl(
    item.id,
    false,
    isBetaRow(item) ? "beta" : "stable",
    lang,
  );
  const src = failed && item.image_url ? imageUrl(item.image_url) : render;
  return (
    <Link
      prefetch={false}
      href={`/cards/${item.id.toLowerCase()}`}
      className={large ? tileClassLarge : tileClass}
    >
      <img
        src={src}
        alt=""
        width={large ? 132 : 88}
        height={large ? 171 : 114}
        className={`object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] ${large ? "h-[130px] w-[100px] sm:h-[171px] sm:w-[132px]" : "h-[114px] w-[88px]"}`}
        crossOrigin="anonymous"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <span>{item.name}</span>
    </Link>
  );
}

function IconTile({
  item,
  href,
  src,
  large,
}: {
  item: UnlockItem;
  href: string;
  src: string | null;
  large?: boolean;
}) {
  return (
    <Link
      prefetch={false}
      href={href}
      className={large ? tileClassLarge : tileClass}
    >
      {src && (
        <img
          src={src}
          alt=""
          width={large ? 80 : 56}
          height={large ? 80 : 56}
          className={`object-contain ${large ? "h-20 w-20" : "h-14 w-14"}`}
          crossOrigin="anonymous"
          loading="lazy"
        />
      )}
      <span>{item.name}</span>
      <Popover item={item} />
    </Link>
  );
}

export function hasShelf(u: EpochUnlocks): boolean {
  return (
    u.characters.length + u.cards.length + u.relics.length + u.potions.length >
    0
  );
}

export function UnlockShelf({
  unlocks,
  lang,
  className = "",
  large,
}: {
  unlocks: EpochUnlocks;
  lang: string;
  className?: string;
  large?: boolean;
}) {
  if (!hasShelf(unlocks)) return null;
  return (
    <div className={`flex flex-wrap items-start gap-x-3 gap-y-4 ${className}`}>
      {unlocks.characters.map((c) => (
        <IconTile
          key={c.id}
          item={c}
          large={large}
          href={`/characters/${c.id.toLowerCase()}`}
          src={`${CDN_BASE}/ui/characters/character_icon_${c.id.toLowerCase()}.webp`}
        />
      ))}
      {unlocks.cards.map((c) => (
        <CardTile key={c.id} item={c} lang={lang} large={large} />
      ))}
      {unlocks.relics.map((r) => (
        <IconTile
          key={r.id}
          item={r}
          large={large}
          href={`/relics/${r.id.toLowerCase()}`}
          src={r.image_url ? imageUrl(r.image_url) : null}
        />
      ))}
      {unlocks.potions.map((p) => (
        <IconTile
          key={p.id}
          item={p}
          large={large}
          href={`/potions/${p.id.toLowerCase()}`}
          src={p.image_url ? imageUrl(p.image_url) : null}
        />
      ))}
    </div>
  );
}

export function resolveUnlocks(
  epoch: Epoch,
  maps: {
    cards: Record<string, UnlockItem>;
    relics: Record<string, UnlockItem>;
    potions: Record<string, UnlockItem>;
  },
  characters: UnlockItem[],
): EpochUnlocks {
  const pick = (ids: string[] | null, map: Record<string, UnlockItem>) =>
    (ids || []).map((id) => map[id] || { id, name: prettyId(id) });
  return {
    characters: characters.filter((c) => c.epoch_id === epoch.id),
    cards: pick(epoch.unlocks_cards, maps.cards),
    relics: pick(epoch.unlocks_relics, maps.relics),
    potions: pick(epoch.unlocks_potions, maps.potions),
  };
}
