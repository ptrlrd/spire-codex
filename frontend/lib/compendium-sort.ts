import type { Card } from "@/lib/api/types";
import { CHARACTER_ORDER } from "@/lib/character-order";

const POOLS: readonly string[] = [
  ...CHARACTER_ORDER,
  "colorless",
  "event",
  "token",
  "status",
  "curse",
  "quest",
];
const RARITIES = [
  "Basic",
  "Common",
  "Uncommon",
  "Rare",
  "Ancient",
  "Event",
  "Token",
  "Status",
  "Curse",
  "Quest",
];
const TYPES = ["Attack", "Skill", "Power", "Status", "Curse", "Quest"];

function rank(list: readonly string[], value: string | null | undefined) {
  const i = list.indexOf(value ?? "");
  return i === -1 ? list.length : i;
}

function costRank(c: Card): number {
  if (c.is_x_cost) return -1;
  return typeof c.cost === "number" ? c.cost : 0;
}

export function compareCompendium(a: Card, b: Card): number {
  return (
    rank(POOLS, a.color) - rank(POOLS, b.color) ||
    rank(RARITIES, a.rarity_key ?? a.rarity) -
      rank(RARITIES, b.rarity_key ?? b.rarity) ||
    rank(TYPES, a.type_key ?? a.type) - rank(TYPES, b.type_key ?? b.type) ||
    costRank(a) - costRank(b) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}

const SEARCH_FIELDS = [
  "name",
  "description",
  "upgrade_description",
  "type",
  "rarity",
  "color",
  "keywords",
] as const;

export function cardMatchesSearch(c: Card, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const record = c as unknown as Record<string, unknown>;
  const text = SEARCH_FIELDS.map((f) => {
    const v = record[f];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.join(" ");
    return "";
  })
    .join(" ")
    .toLowerCase();
  return words.every((w) => text.includes(w));
}
