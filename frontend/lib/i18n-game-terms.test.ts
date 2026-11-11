import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { safeKey } from "@/lib/i18n-keys";
import { SUPPORTED_LANGS, type LangCode } from "@/lib/languages";

const DATA = join(__dirname, "..", "..", "data");

const CORE_TERMS: Record<string, string[]> = {
  Relic: ["gameplay_ui.RELIC_RARITY.NONE"],
  Relics: ["gameplay_ui.MULTIPLAYER_EXPANDED_STATE.relicHeader"],
  Potions: ["gameplay_ui.MULTIPLAYER_EXPANDED_STATE.potionHeader"],
  Deck: ["gameplay_ui.MULTIPLAYER_EXPANDED_STATE.cardHeader"],
  Ascension: ["gameplay_ui.ASCENSION_LEVEL"],
  Merchant: ["map.LEGEND_MERCHANT.title"],
  "Rest Site": ["static_hover_tips.ROOM_REST.title"],
  Floor: [
    "static_hover_tips.FLOOR.title",
    "main_menu_ui.CONTINUE_RUN_INFO.floor",
  ],
  Block: ["static_hover_tips.BLOCK.title"],
  Energy: ["static_hover_tips.ENERGY.title"],
  Attack: ["gameplay_ui.CARD_TYPE.ATTACK"],
  Skill: ["gameplay_ui.CARD_TYPE.SKILL"],
  Power: ["gameplay_ui.CARD_TYPE.POWER"],
  Curse: ["gameplay_ui.CARD_TYPE.CURSE"],
  Boss: ["map.LEGEND_BOSS.title"],
  Enemy: ["map.LEGEND_ENEMY.title"],
  Event: ["map.EVENT.title"],
  Treasure: ["map.LEGEND_TREASURE.title"],
};

function gameText(pack: unknown, path: string): string | null {
  let node = pack;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}

function plain(text: string): string {
  return text
    .replace(/\[\/?\w+\]|\{\w+\}|[:：]/g, "")
    .trim()
    .toLowerCase();
}

function matches(ui: string, game: string): boolean {
  if (game.endsWith(".")) return ui.startsWith(game.slice(0, -1));
  return ui === game;
}

function argumentNames(text: string): Set<string> {
  const names = new Set<string>();
  const walk = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      if (node.type !== TYPE.tag) names.add(node.value);
      if ("options" in node)
        for (const option of Object.values(node.options)) walk(option.value);
      if ("children" in node) walk(node.children);
    }
  };
  walk(parse(text));
  return names;
}

describe("placeholders in the UI tables", () => {
  const eng = messagesFor("eng");
  for (const lang of SUPPORTED_LANGS) {
    it(`${lang} only uses arguments the English string takes`, () => {
      const ui = messagesFor(lang as LangCode);
      const wrong: string[] = [];
      for (const [key, text] of Object.entries(ui)) {
        if (text === eng[key] || !text.includes("{")) continue;
        let allowed: Set<string>;
        try {
          allowed = argumentNames(eng[key]);
        } catch {
          continue;
        }
        let used: Set<string>;
        try {
          used = argumentNames(text);
        } catch {
          wrong.push(`${key}: does not parse`);
          continue;
        }
        const extra = [...used].filter((name) => !allowed.has(name));
        if (extra.length) wrong.push(`${key}: ${extra.join(", ")}`);
      }
      expect(wrong).toEqual([]);
    });
  }
});

describe("core game terms in the UI tables", () => {
  for (const lang of SUPPORTED_LANGS) {
    it(`${lang} uses the game's own words`, () => {
      const pack = JSON.parse(
        readFileSync(join(DATA, lang, "messages.json"), "utf8"),
      );
      const ui = messagesFor(lang as LangCode);
      const wrong: string[] = [];
      for (const [term, paths] of Object.entries(CORE_TERMS)) {
        const accepted = paths
          .map((path) => gameText(pack, path))
          .filter((text): text is string => text !== null)
          .map(plain);
        expect(accepted.length, `${lang} ${term}`).toBeGreaterThan(0);
        const shown = plain(ui[safeKey(term)].replace(/''/g, "'"));
        if (!accepted.some((game) => matches(shown, game)))
          wrong.push(`${term}: "${shown}" should be "${accepted[0]}"`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it("calls a run the same thing in either case", () => {
    for (const lang of ["jpn", "kor", "tha", "zhs", "zht"] as const) {
      const ui = messagesFor(lang);
      expect(ui[safeKey("runs")], lang).toBe(ui[safeKey("Runs")]);
    }
  });

  it("leaves no summary sentence untranslated", () => {
    const eng = messagesFor("eng");
    for (const lang of SUPPORTED_LANGS) {
      const ui = messagesFor(lang as LangCode);
      for (const key of [
        "entity_summary_stats",
        "entity_summary_stats_no_pick",
        "entity_summary_best_character",
        "entity_summary_partners",
        "entity_summary_drafted",
      ]) {
        expect(ui[key], `${lang} ${key}`).not.toBe(eng[key]);
        expect(ui[key], `${lang} ${key}`).toMatch(
          key.endsWith("character") ? /\{character\}/ : /\{(list|name)\}/,
        );
      }
    }
  });
});
