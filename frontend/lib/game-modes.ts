export const GAME_MODES = [
  { id: "standard", label: "Standard", words: "Standard mode" },
  { id: "daily", label: "Daily", words: "Daily climb" },
  { id: "custom", label: "Custom", words: "Custom mode" },
  { id: "blitz", label: "Blitz", words: "Blitz mode" },
  { id: "dread", label: "Dread", words: "Dread mode" },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

export const GAME_MODE_IDS: readonly string[] = GAME_MODES.map((m) => m.id);

export function isGameMode(
  value: string | null | undefined,
): value is GameModeId {
  return !!value && GAME_MODE_IDS.includes(value);
}

export function gameModeLabel(value: string | null | undefined): string {
  const key = (value || "standard").toLowerCase();
  return GAME_MODES.find((m) => m.id === key)?.label ?? "";
}

export const GAME_MODE_WORDS: Record<string, string> = Object.fromEntries(
  GAME_MODES.map((m) => [m.id, m.words]),
);
