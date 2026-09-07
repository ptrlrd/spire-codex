export type EntityType =
  | "cards"
  | "relics"
  | "potions"
  | "monsters"
  | "ancients"
  | "characters"
  | "powers"
  | "badges"
  | "intents"
  | "orbs";

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: "cards", label: "Cards" },
  { value: "relics", label: "Relics" },
  { value: "potions", label: "Potions" },
  { value: "monsters", label: "Monsters" },
  { value: "ancients", label: "Ancients" },
  { value: "characters", label: "Characters" },
  { value: "powers", label: "Powers" },
  { value: "badges", label: "Badges" },
  { value: "intents", label: "Intents" },
  { value: "orbs", label: "Orbs" },
];

export const ENTITY_LABEL: Record<EntityType, string> = {
  cards: "Cards",
  relics: "Relics",
  potions: "Potions",
  monsters: "Monsters",
  ancients: "Ancients",
  characters: "Characters",
  powers: "Powers",
  badges: "Badges",
  intents: "Intents",
  orbs: "Orbs",
};

/** Ancients aren't a normal API entity (the pool data carries no name/image),
 * so the eight are defined here with their "cute" portrait from misc/. The
 * raw path is resolved through imageUrl() in fetchEntities. */
export const ANCIENT_ENTITIES: { id: string; name: string; image_path: string }[] = [
  { id: "NEOW", name: "Neow", image_path: "/static/images/misc/ancients/neow.webp" },
  { id: "TEZCATARA", name: "Tezcatara", image_path: "/static/images/misc/ancients/tezcatara.webp" },
  { id: "PAEL", name: "Pael", image_path: "/static/images/misc/ancients/pael.webp" },
  { id: "OROBAS", name: "Orobas", image_path: "/static/images/misc/ancients/orobas.webp" },
  { id: "DARV", name: "Darv", image_path: "/static/images/misc/ancients/darv.webp" },
  { id: "NONUPEIPE", name: "Nonupeipe", image_path: "/static/images/misc/ancients/nonupeipe.webp" },
  { id: "TANX", name: "Tanx", image_path: "/static/images/misc/ancients/tanx.webp" },
  { id: "VAKUU", name: "Vakuu", image_path: "/static/images/misc/ancients/vakuu.webp" },
];

/** A single rankable thing, resolved from the entity API for display. */
export interface TierEntity {
  id: string;
  name: string;
  image: string;
  /** Grouping key for tray filters. For cards this is the character/pool
   * color (ironclad, silent, colorless, …); unset for other entity types. */
  group?: string;
  /** Rarity key (Common, Uncommon, Rare, Shop, Event, Ancient, …) for the
   * tray's secondary rarity filter. Set wherever the API exposes one. */
  rarity?: string;
  /** Beta-only entity (in the current beta but not main); shown with a
   * Beta marker on its chip. */
  beta?: boolean;
}

/** Canonical rarity ordering for the tray's rarity dropdown. Anything not
 * listed falls to the end. Covers cards, relics, and potions. */
export const RARITY_ORDER = [
  "Starter",
  "Basic",
  "Common",
  "Uncommon",
  "Rare",
  "Shop",
  "Event",
  "Ancient",
  "Curse",
  "Status",
  "Token",
  "Quest",
];

/** Card color groups in display order, with labels, for the tray's character
 * filter. The five characters come first, then the shared/non-character pools.
 * Only groups actually present in the loaded cards get a filter pill. */
export const CARD_GROUPS: { value: string; label: string }[] = [
  { value: "ironclad", label: "Ironclad" },
  { value: "silent", label: "Silent" },
  { value: "defect", label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent", label: "Regent" },
  { value: "colorless", label: "Colorless" },
  { value: "curse", label: "Curse" },
  { value: "status", label: "Status" },
  { value: "event", label: "Event" },
  { value: "token", label: "Token" },
  { value: "quest", label: "Quest" },
];

/** Relic tray filter groups: the character pools (from each relic's `pool`
 * field) followed by the eight ancients. Ancient relics carry `pool: shared`
 * in the relic data, so their ancient is resolved from /api/ancient-pools
 * (each ancient relic belongs to exactly one ancient) and used as the group.
 * Only groups actually present in the loaded relics get a filter pill. */
export const RELIC_GROUPS: { value: string; label: string }[] = [
  { value: "shared", label: "Shared" },
  { value: "ironclad", label: "Ironclad" },
  { value: "silent", label: "Silent" },
  { value: "defect", label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent", label: "Regent" },
  { value: "neow", label: "Neow" },
  { value: "tezcatara", label: "Tezcatara" },
  { value: "pael", label: "Pael" },
  { value: "orobas", label: "Orobas" },
  { value: "darv", label: "Darv" },
  { value: "nonupeipe", label: "Nonupeipe" },
  { value: "tanx", label: "Tanx" },
  { value: "vakuu", label: "Vakuu" },
];

/** Monster tray filter groups: the act each monster appears in, taken from
 * its encounter list (the two constructs that show up in more than one act
 * group under their first). "Event and Special" catches monsters with no act
 * of their own (the Architect, battle friends, ...). */
export const MONSTER_GROUPS: { value: string; label: string }[] = [
  { value: "act1-overgrowth", label: "Act 1 Overgrowth" },
  { value: "act1-underdocks", label: "Act 1 Underdocks" },
  { value: "act2-hive", label: "Act 2 Hive" },
  { value: "act3-glory", label: "Act 3 Glory" },
  { value: "other", label: "Event and Special" },
];

/** Tray filter groups per entity type (cards, relics, and monsters today). */
export const GROUPS_BY_TYPE: Partial<Record<EntityType, { value: string; label: string }[]>> = {
  cards: CARD_GROUPS,
  relics: RELIC_GROUPS,
  monsters: MONSTER_GROUPS,
};

export interface Tier {
  id: string;
  label: string;
  color: string;
  items: string[];
}

export interface TierList {
  id?: string;
  share_id?: string;
  title: string;
  entity_type: EntityType;
  tiers: Tier[];
  unranked: string[];
  /** Per-item rationale notes, keyed by entity id. */
  comments?: Record<string, string>;
  owner_username?: string | null;
}

/** The id of the leftover tray, kept distinct from any user tier id. */
export const TRAY_ID = "__tray__";

/** Preset row colors, also offered in the per-row color picker. */
export const TIER_COLORS = [
  "#ff7f7f",
  "#ffbf7f",
  "#ffdf7f",
  "#ffff7f",
  "#bfff7f",
  "#7fff7f",
  "#7fffff",
  "#7fbfff",
  "#bf7fff",
  "#ff7fdf",
  "#cccccc",
];

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes; collisions don't matter, these are
  // ephemeral client-side row ids.
  return `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function defaultTiers(): Tier[] {
  const labels = ["S", "A", "B", "C", "D", "F"];
  return labels.map((label, i) => ({
    id: uid(),
    label,
    color: TIER_COLORS[i] ?? "#cccccc",
    items: [],
  }));
}
