export interface EloLadder {
  elo: number;
  runs: number;
  wins: number;
}

export interface EloPlayer {
  rank: number;
  username: string;
  elo: number;
  lifetime: number;
  runs: number;
  wins: number;
  win_rate: number;
  main_character: string | null;
  by_character: Record<string, EloLadder>;
}

export interface EloBoard {
  players: EloPlayer[];
  total_rated: number;
  min_runs: number;
  computed_at: string | null;
}

interface CharacterNameRow {
  id: string;
  name: string;
}

export type SortKey = "elo" | "lifetime";

export function sortPlayers(players: EloPlayer[], key: SortKey): EloPlayer[] {
  return [...players].sort((a, b) => b[key] - a[key] || a.rank - b.rank);
}

export function ladderTitle(
  player: EloPlayer,
  name: (id: string) => string,
): string {
  return Object.entries(player.by_character ?? {})
    .sort((a, b) => b[1].runs - a[1].runs)
    .map(([id, l]) => `${name(id)} ${Math.round(l.elo)} (${l.wins}/${l.runs})`)
    .join(" · ");
}
