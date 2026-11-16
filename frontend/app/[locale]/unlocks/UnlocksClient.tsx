"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import RichDescription from "@/app/components/RichDescription";
import BetaBadge from "@/app/components/BetaBadge";
import { markBetaUnlocks } from "@/lib/unlocks-merge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import { textColor } from "@/lib/character-colors";

interface UnlockEntity {
  beta?: boolean;
  id: string;
  name: string;
  type?: string;
  rarity?: string;
  color?: string;
  character: string;
  image_url: string | null;
  epoch_id: string;
  epoch_title: string;
  era: string;
  unlock_info: string;
  sort_order: number;
}

interface CharacterUnlock {
  beta?: boolean;
  id: string;
  name: string;
  epoch_id: string;
  epoch_title: string;
  era: string;
  unlock_info: string;
  sort_order: number;
}

export interface UnlocksData {
  characters: CharacterUnlock[];
  cards: UnlockEntity[];
  relics: UnlockEntity[];
  potions: UnlockEntity[];
  events: UnlockEntity[];
}

type Tab = "all" | "characters" | "cards" | "relics" | "potions";
type CharFilter =
  | "all"
  | "ironclad"
  | "silent"
  | "defect"
  | "regent"
  | "necrobinder"
  | "fool"
  | "shared";

const CHAR_COLORS: Record<string, string> = {
  Ironclad: "var(--color-ironclad)",
  Silent: "var(--color-silent)",
  Defect: "var(--color-defect)",
  Regent: "var(--color-regent)",
  Fool: "var(--color-fool)",
  Necrobinder: "var(--color-necrobinder)",
  Shared: "var(--text-muted)",
};

type ItemType = "characters" | "cards" | "relics" | "potions";

interface GroupItem {
  type: ItemType;
  id: string;
  name: string;
  image_url: string | null;
  beta?: boolean;
}

interface UnlockGroup {
  epochId: string;
  epochTitle: string;
  info: string;
  character: string;
  sortOrder: number;
  items: GroupItem[];
}

const CHARACTER_ORDER = [
  "Ironclad",
  "Silent",
  "Defect",
  "Regent",
  "Necrobinder",
  "Fool",
  "Shared",
];

function titleCase(id: string): string {
  return id.charAt(0) + id.slice(1).toLowerCase();
}

function groupUnlocks(data: UnlocksData, types: ItemType[]): UnlockGroup[] {
  const groups = new Map<string, UnlockGroup>();
  const add = (
    type: ItemType,
    row: CharacterUnlock | UnlockEntity,
    character: string,
    image_url: string | null,
  ) => {
    let group = groups.get(row.epoch_id);
    if (!group) {
      group = {
        epochId: row.epoch_id,
        epochTitle: row.epoch_title,
        info: row.unlock_info,
        character,
        sortOrder: row.sort_order,
        items: [],
      };
      groups.set(row.epoch_id, group);
    }
    group.items.push({
      type,
      id: row.id,
      name: row.name,
      image_url,
      beta: row.beta,
    });
  };
  if (types.includes("characters"))
    for (const c of data.characters)
      add(
        "characters",
        c,
        titleCase(c.id),
        `/static/images/characters/combat_${c.id.toLowerCase()}.webp`,
      );
  for (const type of ["cards", "relics", "potions"] as const)
    if (types.includes(type))
      for (const e of data[type]) add(type, e, e.character, e.image_url);
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

function UnlockItem({ item, bp }: { item: GroupItem; bp: string }) {
  const lang = useGameLocale();
  const [cardFailed, setCardFailed] = useState(false);
  const isCard = item.type === "cards" && !cardFailed;
  const src = isCard
    ? fullCardUrl(
        item.id.toLowerCase(),
        false,
        item.beta ? "beta" : "stable",
        lang,
      )
    : imageUrl(item.image_url);
  return (
    <Link
      prefetch={false}
      href={`${bp}/${item.type}/${item.id.toLowerCase()}`}
      className="group flex w-[5.5rem] flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition-colors hover:bg-[var(--bg-card-hover)]"
    >
      <span
        className={`flex items-center justify-center ${item.type === "relics" || item.type === "potions" ? "h-16" : "h-24"}`}
      >
        {src && (
          <img
            src={src}
            alt=""
            loading="lazy"
            crossOrigin="anonymous"
            onError={isCard ? () => setCardFailed(true) : undefined}
            className={
              isCard
                ? "h-24 w-auto drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
                : item.type === "characters"
                  ? "h-24 w-24 object-contain"
                  : "h-14 w-14 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            }
          />
        )}
      </span>
      <span className="text-xs leading-tight text-[var(--text-secondary)] group-hover:text-[var(--accent-gold)]">
        {item.name}
      </span>
      {item.beta && <BetaBadge />}
    </Link>
  );
}

function UnlockRow({ group, bp }: { group: UnlockGroup; bp: string }) {
  return (
    <li className="border-b border-[var(--border-subtle)] py-4">
      <div className="mb-2">
        <p className="text-sm leading-snug text-[var(--text-primary)]">
          <RichDescription text={group.info} />
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {group.epochTitle}
        </p>
      </div>
      <div className="-mx-1.5 flex flex-wrap gap-x-1 gap-y-2">
        {group.items.map((item) => (
          <UnlockItem key={`${item.type}-${item.id}`} item={item} bp={bp} />
        ))}
      </div>
    </li>
  );
}

export default function UnlocksClient({
  initial = null,
}: {
  initial?: UnlocksData | null;
}) {
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [data, setData] = useState<UnlocksData | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [tab, setTab] = useState<Tab>("all");
  const [charFilter, setCharFilter] = useState<CharFilter>("all");

  useEffect(() => {
    if (initial) return;
    Promise.all([
      cachedFetch<UnlocksData>(`${API}/api/unlocks?channel=all&lang=${lang}`),
      cachedFetch<UnlocksData>(`${API}/api/unlocks?lang=${lang}`).catch(
        () => null,
      ),
    ])
      .then(([merged, main]) => setData(markBetaUnlocks(merged, main)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lang, initial]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("Loading...")}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tabs: { key: Tab; label: string; count: number }[] = [
    {
      key: "all",
      label: "All",
      count:
        data.characters.length +
        data.cards.length +
        data.relics.length +
        data.potions.length,
    },
    { key: "characters", label: "Characters", count: data.characters.length },
    { key: "cards", label: "Cards", count: data.cards.length },
    { key: "relics", label: "Relics", count: data.relics.length },
    { key: "potions", label: "Potions", count: data.potions.length },
  ];

  const charFilters: { key: CharFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "ironclad", label: "Ironclad" },
    { key: "silent", label: "Silent" },
    { key: "defect", label: "Defect" },
    { key: "regent", label: "Regent" },
    { key: "necrobinder", label: "Necrobinder" },
    { key: "fool", label: "Fool" },
    { key: "shared", label: "Shared" },
  ];

  const types: ItemType[] =
    tab === "all" ? ["characters", "cards", "relics", "potions"] : [tab];
  const groups = groupUnlocks(data, types).filter(
    (g) => charFilter === "all" || g.character.toLowerCase() === charFilter,
  );
  const sections = CHARACTER_ORDER.map((character) => ({
    character,
    groups: groups.filter((g) => g.character === character),
  })).filter((sec) => sec.groups.length > 0);
  const other = groups.filter((g) => !CHARACTER_ORDER.includes(g.character));
  if (other.length > 0) sections.push({ character: "Shared", groups: other });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Unlocks")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t(
          "All unlockable content in Slay the Spire 2, earned through timeline progression.",
        )}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`text-sm px-3.5 py-2 rounded-full border transition-colors ${
              tab === tb.key
                ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30"
                : "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t(tb.label)} ({tb.count})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {charFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setCharFilter(f.key)}
            className={`text-sm px-3 py-2 rounded border transition-colors ${
              charFilter === f.key
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--text-muted)]"
                : "text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]"
            }`}
            style={
              charFilter === f.key && f.key !== "all"
                ? {
                    borderColor: CHAR_COLORS[f.label] || undefined,
                    color: CHAR_COLORS[f.label] || undefined,
                  }
                : undefined
            }
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {sections.map((sec) => (
        <section key={sec.character} className="mb-10">
          <h2 className="mb-1 flex items-center gap-2.5 border-b border-[var(--border-accent)] pb-2 text-xl font-semibold text-[var(--text-primary)]">
            {sec.character !== "Shared" && (
              <img
                src={imageUrl(
                  `/static/images/characters/character_icon_${sec.character.toLowerCase()}.webp`,
                )}
                alt=""
                className="h-7 w-7 object-contain"
                crossOrigin="anonymous"
              />
            )}
            <span
              style={{
                color:
                  sec.character === "Shared"
                    ? undefined
                    : textColor(CHAR_COLORS[sec.character]),
              }}
            >
              {t(sec.character)}
            </span>
          </h2>
          <ul className="grid gap-x-10 lg:grid-cols-2">
            {sec.groups.map((g) => (
              <UnlockRow key={g.epochId} group={g} bp={bp} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
