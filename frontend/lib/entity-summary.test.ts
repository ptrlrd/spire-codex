import { describe, expect, it } from "vitest";
import {
  LIST_SLOT,
  buildEntitySummary,
  listParts,
  pct,
  splitAtSlot,
} from "./entity-summary";
import { messagesFor } from "@/i18n/messages";
import { SUPPORTED_LANGS } from "@/lib/languages";
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

function joined(locale: string, names: string[]): string {
  return listParts(locale, names.length)
    .map((part) => ("text" in part ? part.text : names[part.item]))
    .join("");
}

describe("entity summary sentences", () => {
  it("keeps the English list wording", () => {
    expect(joined("eng", ["A"])).toBe("A");
    expect(joined("eng", ["A", "B"])).toBe("A and B");
    expect(joined("eng", ["A", "B", "C"])).toBe("A, B and C");
  });

  it("joins lists the way each language does", () => {
    expect(joined("deu", ["A", "B", "C"])).toBe("A, B und C");
    expect(joined("jpn", ["A", "B", "C"])).toBe("A、B、C");
    expect(joined("zhs", ["A", "B", "C"])).toBe("A、B和C");
  });

  it("splits a sentence around the list", () => {
    expect(splitAtSlot(`before ${LIST_SLOT} after.`)).toEqual([
      "before ",
      " after.",
    ]);
    expect(splitAtSlot("no list")).toEqual(["no list", ""]);
  });

  it("has one list slot in every language", () => {
    for (const lang of ["eng", ...SUPPORTED_LANGS] as const) {
      const ui = messagesFor(lang);
      for (const key of ["entity_summary_partners", "entity_summary_drafted"])
        expect(ui[key].split("{list}").length, `${lang} ${key}`).toBe(2);
    }
    const eng = messagesFor("eng");
    expect(eng.entity_summary_partners).toBe(
      "It is most often run alongside {list}.",
    );
    expect(eng.entity_summary_drafted).toBe(
      "Players who already have it most often draft {list} next.",
    );
  });
});
