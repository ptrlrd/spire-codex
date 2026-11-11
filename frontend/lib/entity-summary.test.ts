import { describe, expect, it } from "vitest";
import { buildEntitySummary, pct, summaryStats } from "./entity-summary";
import { offerStatsFrom, resolveBracket } from "./entity-cohort";
import {
  draftTakeRate,
  listedDraftRecs,
  rankedDraftRecs,
} from "./entity-links";
import { withOutcomes } from "./event-votes";
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
          offers: 400,
          picks: 60,
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

  it("quotes the cohort the tiles open on, with that cohort's baseline", () => {
    const withSolo: EntityStats = {
      ...stats,
      baseline_win_rate: 44.2,
      win_rate: 58.9,
      brackets: {
        all: {
          picks: 12000,
          wins: 5000,
          win_rate: 58.9,
          elo: null,
          score: null,
          total_runs: 36000,
          pick_rate: 3.4,
          baseline_win_rate: 44.2,
        },
        solo: {
          picks: 4000,
          wins: 1796,
          win_rate: 44.9,
          elo: null,
          score: null,
          total_runs: 20000,
          pick_rate: 3.2,
          hold_rate: 3.1,
          baseline_win_rate: 27.1,
          by_character: [],
        },
      },
    };
    const solo = summaryStats(withSolo);
    expect(solo.cohort).toBe("solo");
    expect(solo.requested).toBeNull();
    expect([solo.winRate, solo.baseline, solo.holdRate, solo.runs]).toEqual([
      44.9, 27.1, 3.1, 4000,
    ]);
    const all = summaryStats(withSolo, "all");
    expect([all.cohort, all.winRate, all.baseline]).toEqual([
      "all",
      58.9,
      44.2,
    ]);
    const older = structuredClone(withSolo);
    delete older.brackets!.solo.baseline_win_rate;
    expect(summaryStats(older).baseline).toBeNull();
    older.metrics = offerStatsFrom(
      { baseline_win_rate: 27.3, rows: [] },
      "BASH",
      "solo",
    );
    expect(summaryStats(older).baseline).toBe(27.3);
  });

  it("says so when the asked-for cohort has no data and falls back", () => {
    const coop: EntityStats = {
      ...stats,
      brackets: {
        all: {
          picks: 900,
          wins: 500,
          win_rate: 55.6,
          elo: null,
          score: null,
          total_runs: 5000,
          pick_rate: 0.7,
        },
        a10: {
          picks: 300,
          wins: 150,
          win_rate: 50,
          elo: null,
          score: null,
          total_runs: 2000,
          pick_rate: 0.6,
        },
      },
    };
    expect(resolveBracket(coop, "solo")).toMatchObject({
      key: "all",
      requested: "solo",
    });
    expect(resolveBracket(coop, "solo:a10")).toMatchObject({
      key: "a10",
      requested: "solo:a10",
    });
    expect(resolveBracket(coop, "a10").requested).toBeNull();
    const s = summaryStats(coop);
    expect([s.cohort, s.requested, s.winRate]).toEqual(["all", "solo", 55.6]);
  });

  it("reads the pick-when-offered rate off the base row of the metrics table", () => {
    const offer = offerStatsFrom(
      {
        baseline_win_rate: 27.1,
        data_through: "2026-11-10 18:27:31",
        rows: [
          { id: "BASH", upgraded: true, pick_rate: 1 },
          {
            id: "BASH",
            pick_rate: 54.7,
            offered: 76905,
            picked: 42029,
            pick_rate_by_act: [54.5, 55.1, null],
          },
        ],
      },
      "bash",
      "solo",
    );
    expect(offer).toEqual({
      bracket: "solo",
      baseline_win_rate: 27.1,
      data_through: "2026-11-10 18:27:31",
      pick_rate: 54.7,
      pick_rate_by_act: [54.5, 55.1, null],
      offered: 76905,
      picked: 42029,
    });
  });

  it("keeps thin draft rows out of the ranking and the sentence", () => {
    const rec = (id: string, picks?: number) => ({
      id,
      name: id,
      pref: 0.02,
      pref_base: 0.01,
      lift: 2.2,
      offers: 438,
      picks,
      winrate: 0.89,
    });
    const recs = { recommends: [rec("THIN", 9), rec("OLD"), rec("REAL", 50)] };
    expect(rankedDraftRecs(recs).map((r) => r.id)).toEqual(["REAL"]);
    expect(
      buildEntitySummary(null, null, recs)?.draftedNext.map((r) => r.id),
    ).toEqual(["REAL"]);
    expect(
      rankedDraftRecs({ ...recs, min_picks: 80 }).map((r) => r.id),
    ).toEqual([]);
  });

  it("lists stored rows until the draft cache is rebuilt with the floor", () => {
    const rec = (id: string, picks?: number) => ({
      id,
      name: id,
      pref: 0.29,
      pref_base: 0.2,
      lift: 1.4,
      offers: 174,
      picks,
      winrate: 0.5,
    });
    const recs = { recommends: [rec("THIN", 9), rec("OLD"), rec("REAL", 57)] };
    expect(listedDraftRecs(recs).map((r) => r.id)).toEqual(["THIN", "REAL"]);
    expect(
      listedDraftRecs({ ...recs, min_picks: 50 }).map((r) => r.id),
    ).toEqual(["REAL"]);
    expect(draftTakeRate(rec("REAL", 57))).toBeCloseTo(57 / 174);
    expect(draftTakeRate(rec("OLD"))).toBe(0.29);
  });

  it("lays win rate and lift over an event's vote split", () => {
    const votes = {
      total: 300,
      options: [
        { id: "BLOODY_INK", label: "Bloody Ink", count: 200, pct: 66.7 },
        { id: "SPONGE", label: "Sponge", count: 100, pct: 33.3 },
      ],
    };
    const rows = [
      {
        event: "SCRIPTORIUM",
        option: "BLOODY_INK",
        chosen: 210,
        share: 67.7,
        win_rate: 34.1,
        lift: 6.2,
      },
      {
        event: "SCRIPTORIUM",
        option: "SPONGE",
        chosen: 100,
        share: 32.3,
        win_rate: 40,
        lift: null,
      },
      { event: "OTHER", option: "SPONGE", chosen: 5, win_rate: 1, lift: 1 },
    ];
    const out = withOutcomes(votes, "scriptorium", rows);
    expect(out.total).toBe(310);
    expect(out.hasOutcomes).toBe(true);
    expect(out.options[0]).toMatchObject({
      count: 210,
      pct: 67.7,
      winRate: 34.1,
      lift: 6.2,
    });
    expect(out.options[1]).toMatchObject({ winRate: 40, lift: null });
    expect(withOutcomes(votes, "scriptorium", [])).toBe(votes);
  });

  it("formats percentages to one decimal", () => {
    expect(pct(41.666)).toBe("41.7%");
    expect(pct(50)).toBe("50%");
  });
});
