export interface GameModeEntry {
  id?: string | null;
  name: string;
  description: string;
}

export interface GameModeDominion {
  id: string;
  encounter_id?: string | null;
  boss_name: string;
  name: string;
  description: string;
}

export interface GameModeRow {
  id: string;
  name: string;
  description?: string | null;
  multiplayer_description?: string | null;
  intro?: string | null;
  rules?: string[] | null;
  epoch_id?: string | null;
  unlock_text?: string | null;
  unlock_info?: string | null;
  neow?: GameModeEntry | null;
  merchant_entries?: GameModeEntry[] | null;
  dominions?: GameModeDominion[] | null;
  rotating_streak?: GameModeEntry | null;
}

export function betaOnlyModeIds(
  main: GameModeRow[],
  shown: GameModeRow[],
): string[] {
  const inMain = new Set(main.map((m) => m.id));
  return shown.filter((m) => m.epoch_id && !inMain.has(m.id)).map((m) => m.id);
}

export function modeAnchor(id: string): string {
  return id.toLowerCase().replace(/_/g, "-");
}
