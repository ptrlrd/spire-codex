import { describe, expect, it } from "vitest";
import { buildEntitySummary, pct } from "./entity-summary";
import type { EntityStats } from "@/app/components/EntityRunStats";

const stats: EntityStats = {
  entity_type: "cards",
  entity_id: "BASH",
  picks: 12000,
  wins: 5000,
  win_rate: 41.7,
  pick_rate: 33.3,
  total_runs: 36000,
  baseline_win_rate: 38.2,
  score: null,
  elo: null,
  by_character: [
    { character: "ironclad", picks: 11000, wins: 4600, win_rate: 41.8 },
    { character: "silent", picks: 50, wins: 40, win_rate: 80 },
  ],
  last_submitted_at: null,
  last_run_hash: null,
};

describe("entity summary", () => {
  it("needs enough picks before it quotes a win rate", () => {
    expect(buildEntitySummary({ ...stats, picks: 12 }, null, null)).toBeNull();
    const s = buildEntitySummary(stats, null, null);
    expect(s?.runs).toBe(12000);
    expect(s?.winRate).toBe(41.7);
    expect(s?.bestCharacter).toBeNull();
  });

  it("names a best character only when two characters have real samples", () => {
    const two = {
      ...stats,
      by_character: [
        { character: "ironclad", picks: 11000, wins: 4600, win_rate: 41.8 },
        { character: "silent", picks: 900, wins: 400, win_rate: 44.4 },
      ],
    };
    expect(buildEntitySummary(two, null, null)?.bestCharacter?.character).toBe(
      "silent",
    );
  });

  it("takes two card partners, one relic, and three draft picks", () => {
    const partner = (id: string) => ({
      id,
      name: id,
      desc: "",
      co: 1,
      conf: 0.5,
      conf_rev: 0.5,
      npmi: 0.2,
      winrate: 0.4,
    });
    const s = buildEntitySummary(
      null,
      {
        partners: {
          cards: [partner("A"), partner("B"), partner("C")],
          relics: [partner("R1"), partner("R2")],
        },
      },
      {
        recommends: ["X", "Y", "Z", "W"].map((id) => ({
          id,
          name: id,
          pref: 0.5,
          pref_base: 0.3,
          lift: 1.6,
          offers: 100,
          winrate: 0.4,
        })),
      },
    );
    expect(s?.partners.map((p) => `${p.kind}:${p.id}`)).toEqual([
      "cards:A",
      "cards:B",
      "relics:R1",
    ]);
    expect(s?.draftedNext.map((p) => p.id)).toEqual(["X", "Y", "Z"]);
    expect(s?.runs).toBeNull();
  });

  it("formats percentages to one decimal", () => {
    expect(pct(41.666)).toBe("41.7%");
    expect(pct(50)).toBe("50%");
  });
});
