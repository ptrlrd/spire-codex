export type TFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export const PLAYER_AXIS = [
  { key: "", label: "All" },
  { key: "solo", label: "Solo" },
  { key: "2p", label: "2P" },
  { key: "3p", label: "3P" },
  { key: "4p", label: "4P" },
];
export const SKILL_AXIS = [
  { key: "", label: "All" },
  { key: "a10", label: "A10" },
  { key: "wr30", label: "A10 >30% WR" },
  { key: "wr50", label: "A10 >50% WR" },
  { key: "wr75", label: "A10 >75% WR" },
];
export const MODE_AXIS = [
  { key: "", label: "All" },
  { key: "standard", label: "Standard" },
  { key: "daily", label: "Daily" },
  { key: "custom", label: "Custom" },
];
export const CHARACTERS = [
  "IRONCLAD",
  "SILENT",
  "DEFECT",
  "NECROBINDER",
  "REGENT",
];

const PLAYER_KEYS = PLAYER_AXIS.map((a) => a.key).filter(Boolean);
const SKILL_KEYS = SKILL_AXIS.map((a) => a.key).filter(Boolean);
const MODE_KEYS = MODE_AXIS.map((a) => a.key).filter(Boolean);
const VERSION_RE = /^v\d+(\.\d+)*(-rc\.\d+)?$/;

export const DEFAULT_BRACKET = "solo:standard";

export interface BracketParts {
  player: string;
  skill: string;
  mode: string;
  version: string;
}

export function parseBracket(b: string): BracketParts {
  const out: BracketParts = { player: "", skill: "", mode: "", version: "" };
  for (const part of b.split(":")) {
    if (VERSION_RE.test(part)) out.version = part;
    else if (PLAYER_KEYS.includes(part)) out.player = part;
    else if (SKILL_KEYS.includes(part)) out.skill = part;
    else if (MODE_KEYS.includes(part)) out.mode = part;
  }
  return out;
}

export function combineBracket(
  player: string,
  skill: string,
  mode: string,
  version = "",
): string {
  const base = [player, skill, mode, version].filter(Boolean).join(":");
  return base || "all";
}

export function isValidBracket(b: string): boolean {
  if (b === "all" || b === "") return true;
  const seen = new Set<string>();
  for (const part of b.split(":")) {
    let axis = "";
    if (VERSION_RE.test(part)) axis = "version";
    else if (PLAYER_KEYS.includes(part)) axis = "player";
    else if (SKILL_KEYS.includes(part)) axis = "skill";
    else if (MODE_KEYS.includes(part)) axis = "mode";
    else return false;
    if (seen.has(axis)) return false;
    seen.add(axis);
  }
  return true;
}

const PLAYER_WORDS: Record<string, string> = {
  solo: "Solo",
  "2p": "Two players",
  "3p": "Three players",
  "4p": "Four players",
};
const MODE_WORDS: Record<string, string> = {
  standard: "Standard mode",
  daily: "Daily climb",
  custom: "Custom mode",
};
const SKILL_PCT: Record<string, number> = { wr30: 30, wr50: 50, wr75: 75 };

export function cohortLabel(b: string, t: TFn, character = ""): string {
  const { player, skill, mode, version } = parseBracket(b);
  const parts: string[] = [];
  if (player) parts.push(t(PLAYER_WORDS[player]));
  if (skill) {
    parts.push(t("Ascension 10"));
    if (SKILL_PCT[skill])
      parts.push(t("players above {pct}% win rate", { pct: SKILL_PCT[skill] }));
  }
  if (mode) parts.push(t(MODE_WORDS[mode]));
  if (version) parts.push(version);
  if (character)
    parts.push(
      t("played by {character}", {
        character: t(character.charAt(0) + character.slice(1).toLowerCase()),
      }),
    );
  return parts.length ? parts.join(", ") : t("all runs");
}
