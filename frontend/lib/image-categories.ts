import { X9F } from "@/lib/i18n-x9f";
import { LANG_NAMES, type LangCode } from "@/lib/languages";

export const CATEGORY_LABELS: Record<string, string> = {
  cards: "Card Renders",
  animations: "Animations",
  monsters: "Monster Renders",
  "monsters-skins": "Monster Skins",
  characters: "Character Renders",
  "characters-forms": "Character Forms",
  relics: "Relic Renders",
  potions: "Potion Renders",
  backgrounds: "Backgrounds (Scenes)",
  "card-frames": "Card Frames",
  enchantments: "Enchantment Badges",
  "enchantments-cards": "Enchanted Cards",
  "afflictions-cards": "Afflicted Cards",
  assets: "Game Assets",
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  cards:
    "Every card as the game draws it, base and upgraded, in every language.",
  animations:
    "Frame-by-frame idle animations for cards, characters and monsters.",
  monsters: "Every monster on its idle pose, trimmed to the art.",
  "monsters-skins": "Alternate skins for the monsters that have them.",
  characters: "The playable characters on their idle pose.",
  "characters-forms": "Characters with their form effects active.",
  relics: "Every relic's art, with the beta-art versions in their own folder.",
  potions: "Every potion, rendered at its in-game size.",
  backgrounds: "Room, event and menu backdrops at full resolution.",
  "card-frames":
    "The frame, banner and cost pieces the game composes cards from.",
  enchantments: "The small badge each enchantment shows on a card.",
  "enchantments-cards":
    "Every card crossed with every enchantment it can carry, per language.",
  "afflictions-cards":
    "Every card crossed with every affliction, per language.",
  assets:
    "The full texture dump: UI, map, powers, orbs, effects and everything else.",
};

export const FOLDER_LABELS: Record<string, string> = {
  beta: "Beta art",
  eng: "English",
  cards: "Cards",
  characters: "Characters",
  "characters-forms": "Character Forms",
  monsters: "Monsters",
  ancients: "Ancients",
  "atlas-sprites": "Atlas sprites",
  atlases: "Atlases",
  card_overlays: "Card overlays",
  debug: "Debug",
  enchantments: "Enchantments",
  events: "Events",
  ftue: "Tutorial",
  map: "Map",
  orbs: "Orbs",
  other: "Other",
  packed: "Packed",
  potions: "Potions",
  powers: "Powers",
  relics: "Relics",
  rooms: "Rooms",
  timeline: "Timeline",
  ui: "UI",
  vfx: "Effects",
  combat: "Combat",
  credits: "Credits",
  emote: "Emotes",
  game_over_screen: "Game over screen",
  hands: "Hands",
  main_menu: "Main menu",
  mods: "Mods",
  profile: "Profile",
  rest_site: "Rest site",
  reward_screen: "Reward screen",
  run_history: "Run history",
  top_panel: "Top panel",
  transitions: "Transitions",
};

export const CHANNEL_LABELS: Record<string, string> = {
  main: "Main {version}",
  beta: "Beta {version}",
};

function own<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function translate(key: string, lang: string): string {
  const entry = own(X9F, key);
  return entry?.[lang] || entry?.eng || key;
}

export function humanize(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

export function categoryLabel(category: string, lang: string): string {
  const key = own(CATEGORY_LABELS, category);
  return key ? translate(key, lang) : humanize(category);
}

export function categoryDescription(
  category: string,
  lang: string,
): string | null {
  const key = own(CATEGORY_DESCRIPTIONS, category);
  return key ? translate(key, lang) : null;
}

export function parseChannel(name: string): "main" | "beta" | null {
  const m = /\((Main|Beta) /.exec(name);
  return m ? (m[1].toLowerCase() as "main" | "beta") : null;
}

export function channelLabel(
  channel: "main" | "beta" | null,
  version: string,
  lang: string,
): string {
  if (!channel) return version;
  return translate(CHANNEL_LABELS[channel], lang).replace("{version}", version);
}

export function folderLabel(folder: string, lang: string): string {
  const own_name = own(LANG_NAMES as Record<string, string>, folder);
  if (own_name) return own_name;
  const key = own(FOLDER_LABELS, folder);
  return key ? translate(key, lang) : humanize(folder);
}
