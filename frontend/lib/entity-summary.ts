import type { EntityStats } from "@/app/components/EntityRunStats";
import { DEFAULT_SOLO_BRACKET } from "@/lib/content-brackets";
import { bracketBaseline, resolveBracket } from "@/lib/entity-cohort";
import {
  rankedDraftRecs,
  type DraftRecs,
  type Pairings,
} from "@/lib/entity-links";

export interface SummaryLink {
  id: string;
  name: string;
  kind: "cards" | "relics" | "potions";
}

export interface SummaryStats {
  cohort: string;
  requested: string | null;
  runs: number | null;
  winRate: number | null;
  baseline: number | null;
  holdRate: number | null;
  bestCharacter: { character: string; winRate: number; picks: number } | null;
}

export interface EntitySummaryData extends SummaryStats {
  partners: SummaryLink[];
  draftedNext: SummaryLink[];
}

const MIN_PICKS = 200;
const MIN_CHARACTER_PICKS = 100;

export function pct(x: number): string {
  return `${Math.round(x * 10) / 10}%`;
}

export function summaryStats(
  stats: EntityStats | null | undefined,
  bracket: string = DEFAULT_SOLO_BRACKET,
): SummaryStats {
  const data: SummaryStats = {
    cohort: "all",
    requested: null,
    runs: null,
    winRate: null,
    baseline: null,
    holdRate: null,
    bestCharacter: null,
  };
  if (!stats) return data;
  const resolved = resolveBracket(stats, bracket);
  const block = resolved.block;
  data.cohort = resolved.key;
  data.requested = resolved.requested;
  const picks = block?.picks ?? stats.picks;
  if (picks < MIN_PICKS) return data;
  data.runs = picks;
  data.winRate = block?.win_rate ?? stats.win_rate;
  data.baseline = bracketBaseline(stats, resolved);
  data.holdRate = block
    ? (block.hold_rate ?? block.pick_rate)
    : (stats.hold_rate ?? stats.pick_rate);
  const rows = (block?.by_character ?? stats.by_character ?? []).filter(
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
  return data;
}

export function buildEntitySummary(
  stats: EntityStats | null | undefined,
  pairings: Pairings | null | undefined,
  recs: DraftRecs | null | undefined,
  bracket: string = DEFAULT_SOLO_BRACKET,
): EntitySummaryData | null {
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
  const data: EntitySummaryData = {
    ...summaryStats(stats, bracket),
    partners: partners.slice(0, 3),
    draftedNext: rankedDraftRecs(recs)
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        name: r.name,
        kind: "cards" as const,
      })),
  };
  const hasAnything =
    data.runs !== null || data.partners.length > 0 || data.draftedNext.length;
  return hasAnything ? data : null;
}
