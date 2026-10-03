export type GridKind =
  "cards" | "relics" | "potions" | "shops" | "events" | "campfires";

export interface WaxBlock {
  picks: number;
  wins: number;
  winRate: number | null;
  winRateCi: [number, number] | null;
}

export interface GridRow {
  key: string;
  id: string;
  href: string | null;
  name: string;
  sub: string | null;
  group: string;
  rarity: string | null;
  color: string | null;
  imageUrl: string | null;
  upgraded: boolean;
  n: number;
  score: number | null;
  tier: string | null;
  elo: number | null;
  winRate: number | null;
  winRateCi: [number, number] | null;
  pickRate: number | null;
  holdRate: number | null;
  useRate: number | null;
  buyRate: number | null;
  share: number | null;
  lowHpShare: number | null;
  lift: number | null;
  liftN: number | null;
  offered: number | null;
  picked: number | null;
  wins: number;
  losses: number;
  pickByAct: (number | null)[];
  wax: WaxBlock | null;
}

export interface GridTotals {
  totalRuns: number;
  totalSeats: number | null;
  totalWins: number | null;
  baselineWinRate: number | null;
  dataThrough: string | null;
}

export interface GridData {
  kind: GridKind;
  rows: GridRow[];
  totals: GridTotals;
  bracket: string;
  character: string;
  available: boolean;
}
