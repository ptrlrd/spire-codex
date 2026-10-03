import type { GridKind } from "./types";

export type ColKey =
  | "name"
  | "score"
  | "elo"
  | "winRate"
  | "pickRate"
  | "holdRate"
  | "useRate"
  | "buyRate"
  | "share"
  | "lowHpShare"
  | "lift"
  | "n"
  | "offered"
  | "picked"
  | "act"
  | "wl";

export interface KindConfig {
  path: string;
  title: string;
  description: string;
  nameLabel: string;
  nameTitle: string;
  nLabel: string;
  nTitle: string;
  searchPlaceholder: string;
  emptyText: string;
  columns: ColKey[];
  groupFilter: "color" | "pool" | "entity" | null;
  rarityFilter: boolean;
  showCharacter: boolean;
  preview: boolean;
  intro: string;
}

export const KINDS: Record<GridKind, KindConfig> = {
  cards: {
    path: "/stats/cards",
    title: "Card Metrics",
    description: "leaderboards_metrics_meta_description",
    nameLabel: "Card",
    nameTitle: "Card name",
    nLabel: "Picks",
    nTitle: "Seats whose deck held this card (sample size)",
    searchPlaceholder: "Search cards...",
    emptyText: "No cards match your filters.",
    columns: [
      "name",
      "score",
      "elo",
      "winRate",
      "pickRate",
      "holdRate",
      "lift",
      "offered",
      "n",
      "act",
      "wl",
    ],
    groupFilter: "color",
    rarityFilter: false,
    showCharacter: true,
    preview: true,
    intro: "cards_metrics_intro",
  },
  relics: {
    path: "/stats/relics",
    title: "Relic Metrics",
    description: "relic_metrics_meta_description",
    nameLabel: "Relic",
    nameTitle: "Relic name",
    nLabel: "Picks",
    nTitle: "Seats that held this relic (sample size)",
    searchPlaceholder: "Search relics...",
    emptyText: "No relics match your filters.",
    columns: [
      "name",
      "score",
      "elo",
      "winRate",
      "pickRate",
      "holdRate",
      "lift",
      "offered",
      "n",
      "act",
      "wl",
    ],
    groupFilter: "pool",
    rarityFilter: true,
    showCharacter: true,
    preview: false,
    intro: "relic_metrics_intro",
  },
  potions: {
    path: "/stats/potions",
    title: "Potion Metrics",
    description: "potion_metrics_meta_description",
    nameLabel: "Potion",
    nameTitle: "Potion name",
    nLabel: "Picks",
    nTitle: "Seats that held this potion (sample size)",
    searchPlaceholder: "Search potions...",
    emptyText: "No potions match your filters.",
    columns: [
      "name",
      "score",
      "winRate",
      "holdRate",
      "useRate",
      "lift",
      "n",
      "wl",
    ],
    groupFilter: "pool",
    rarityFilter: true,
    showCharacter: true,
    preview: false,
    intro: "potion_metrics_intro",
  },
  shops: {
    path: "/stats/shops",
    title: "Shop Stats",
    description: "shop_stats_meta_description",
    nameLabel: "Item",
    nameTitle: "Shop item",
    nLabel: "Bought",
    nTitle: "Seats that bought this item (sample size)",
    searchPlaceholder: "Search shop items...",
    emptyText: "No shop data yet.",
    columns: ["name", "offered", "n", "buyRate", "winRate", "lift", "wl"],
    groupFilter: "entity",
    rarityFilter: false,
    showCharacter: false,
    preview: false,
    intro: "shop_stats_intro",
  },
  events: {
    path: "/stats/events",
    title: "Event Choices",
    description: "event_choices_meta_description",
    nameLabel: "Event",
    nameTitle: "Event and the option taken",
    nLabel: "Chosen",
    nTitle: "Seats that took this option (sample size)",
    searchPlaceholder: "Search events...",
    emptyText: "No event data yet.",
    columns: ["name", "n", "share", "winRate", "lift", "wl"],
    groupFilter: null,
    rarityFilter: false,
    showCharacter: false,
    preview: false,
    intro: "event_choices_intro",
  },
  campfires: {
    path: "/stats/campfires",
    title: "Campfires",
    description: "campfires_meta_description",
    nameLabel: "Choice",
    nameTitle: "Rest site action",
    nLabel: "Chosen",
    nTitle: "Seats that took this action (sample size)",
    searchPlaceholder: "Search actions...",
    emptyText: "No campfire data yet.",
    columns: ["name", "n", "share", "winRate", "lift", "lowHpShare", "wl"],
    groupFilter: null,
    rarityFilter: false,
    showCharacter: false,
    preview: false,
    intro: "campfires_intro",
  },
};

export const STATS_LINKS = [
  { href: "/stats", label: "Stats" },
  { href: "/stats/cards", label: "Cards" },
  { href: "/stats/relics", label: "Relics" },
  { href: "/stats/potions", label: "Potions" },
  { href: "/stats/shops", label: "Shops" },
  { href: "/stats/events", label: "Events" },
  { href: "/stats/campfires", label: "Campfires" },
  { href: "/stats/characters", label: "Characters" },
  { href: "/stats/encounters", label: "Encounters" },
  { href: "/stats/charts", label: "Charts" },
  { href: "/stats/scoring", label: "Scoring" },
  { href: "/top-players", label: "Top Players" },
];
