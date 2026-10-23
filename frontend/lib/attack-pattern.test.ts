import { describe, expect, it } from "vitest";
import type { AttackPattern } from "./api/types";
import { randomPatternSentences, randomPatternSummary } from "./attack-pattern";

const t = (key: string, values?: Record<string, string | number>) =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`));
const names: Record<string, string> = {
  CLAW: "Claw",
  RIP_AND_TEAR: "Rip and Tear",
  ROAR: "Roar",
  HEADBUTT: "Headbutt",
  SWIPE_RANDOM: "Swipe Random",
  ILLUSORY_SPORES: "Illusory Spores",
};
const nameOf = (id: string) => names[id] ?? id;

const mawler: AttackPattern = {
  type: "random",
  initial_move: "CLAW",
  description: "",
  states: [
    {
      id: "RIP_AND_TEAR_MOVE",
      type: "move",
      move_id: "RIP_AND_TEAR",
      next: "RAND",
    },
    { id: "ROAR_MOVE", type: "move", move_id: "ROAR", next: "RAND" },
    { id: "CLAW_MOVE", type: "move", move_id: "CLAW", next: "RAND" },
    { id: "RAND", type: "random", branches: [] },
    {
      id: "RAND",
      type: "random",
      branches: [
        { move_id: "RIP_AND_TEAR", weight: 1, repeat: "CannotRepeat" },
        { move_id: "ROAR", weight: 1, repeat: "UseOnlyOnce" },
        { move_id: "CLAW", weight: 1, repeat: "CannotRepeat" },
      ],
    },
  ],
};

describe("random attack pattern copy", () => {
  it("reads the Mawler the way the state machine plays it", () => {
    const s = randomPatternSummary(mawler)!;
    expect(s.opening).toBe("CLAW");
    expect(s.alternation).toEqual(["CLAW", "RIP_AND_TEAR"]);
    expect(randomPatternSentences(s, nameOf, t, "eng")).toEqual([
      "Opens with Claw.",
      "Every turn after that is an even random pick between Rip and Tear, Roar, and Claw.",
      "Rip and Tear and Claw never repeat back to back.",
      "Roar happens once per fight.",
      "Once Roar is spent, the rest of the fight alternates Claw and Rip and Tear.",
    ]);
  });

  it("states odds as percentages when the weights differ", () => {
    const fogmog: AttackPattern = {
      type: "random",
      initial_move: "ILLUSORY_SPORES",
      description: "",
      states: [
        {
          id: "R",
          type: "random",
          branches: [
            { move_id: "SWIPE_RANDOM", weight: 2, repeat: "CannotRepeat" },
            { move_id: "HEADBUTT", weight: 3, repeat: "CannotRepeat" },
          ],
        },
      ],
    };
    const s = randomPatternSummary(fogmog)!;
    expect(s.branches.map((b) => b.pct)).toEqual([40, 60]);
    expect(s.alternation).toBeNull();
    expect(randomPatternSentences(s, nameOf, t, "eng")).toEqual([
      "Opens with Illusory Spores.",
      "Every turn after that it picks Swipe Random 40 percent of the time or Headbutt 60 percent of the time.",
      "An attack never repeats back to back.",
    ]);
  });

  it("leaves cycles and conditionals alone", () => {
    expect(
      randomPatternSummary({
        type: "cycle",
        initial_move: "A",
        description: "",
        states: [{ id: "A_MOVE", type: "move", move_id: "A", next: "B_MOVE" }],
      }),
    ).toBeNull();
    expect(
      randomPatternSummary({
        ...mawler,
        states: [
          ...mawler.states,
          { id: "C", type: "conditional", branches: [] },
        ],
      }),
    ).toBeNull();
  });
});
