import type { EntityStats } from "@/app/components/EntityRunStats";
import type { DraftRecs, Pairings } from "@/lib/entity-links";

export interface SummaryLink {
  id: string;
  name: string;
  kind: "cards" | "relics" | "potions";
}

export interface EntitySummaryData {
  runs: number | null;
  winRate: number | null;
  baseline: number | null;
  pickRate: number | null;
  bestCharacter: { character: string; winRate: number; picks: number } | null;
  partners: SummaryLink[];
  draftedNext: SummaryLink[];
}

const MIN_PICKS = 200;
const MIN_CHARACTER_PICKS = 100;

export function pct(x: number): string {
  return `${Math.round(x * 10) / 10}%`;
}

export function buildEntitySummary(
  stats: EntityStats | null | undefined,
  pairings: Pairings | null | undefined,
  recs: DraftRecs | null | undefined,
): EntitySummaryData | null {
  const data: EntitySummaryData = {
    runs: null,
    winRate: null,
    baseline: null,
    pickRate: null,
    bestCharacter: null,
    partners: [],
    draftedNext: [],
  };
  if (stats && stats.picks >= MIN_PICKS) {
    data.runs = stats.picks;
    data.winRate = stats.win_rate;
    data.baseline = stats.baseline_win_rate;
    data.pickRate = stats.pick_rate;
    const rows = (stats.by_character ?? []).filter(
      (r) => r.picks >= MIN_CHARACTER_PICKS,
    );
    if (rows.length > 1) {
      const best = rows.reduce((a, b) => (b.win_rate > a.win_rate ? b : a));
      data.bestCharacter = {
        character: best.character,
        winRate: best.win_rate,
        picks: best.picks,
      };
    }
  }
  const p = pairings?.partners ?? {};
  const partners: SummaryLink[] = [
    ...(p.cards ?? []).slice(0, 2).map((x) => ({
      id: x.id,
      name: x.name,
      kind: "cards" as const,
    })),
    ...(p.relics ?? []).slice(0, 1).map((x) => ({
      id: x.id,
      name: x.name,
      kind: "relics" as const,
    })),
  ];
  data.partners = partners.slice(0, 3);
  data.draftedNext = (recs?.recommends ?? []).slice(0, 3).map((r) => ({
    id: r.id,
    name: r.name,
    kind: "cards" as const,
  }));
  const hasAnything =
    data.runs !== null || data.partners.length > 0 || data.draftedNext.length;
  return hasAnything ? data : null;
}
