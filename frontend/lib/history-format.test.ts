import { describe, expect, it } from "vitest";
import {
  displayValue,
  fieldLabel,
  isInternalField,
  parseChangeLine,
  visibleChanges,
} from "./history-format";

describe("history field labels", () => {
  it("turns diff paths into readable labels", () => {
    expect(fieldLabel("moves[HAMMER_UPPERCUT].powers[0].power_id")).toBe(
      "Moves › Hammer Uppercut › Power 1 › Power",
    );
    expect(fieldLabel("Moves[hammer uppercut].powers[0].power id")).toBe(
      "Moves › Hammer Uppercut › Power 1 › Power",
    );
    expect(fieldLabel("upgrade_description")).toBe("Upgrade description");
    expect(fieldLabel("merchant_price.base")).toBe("Merchant price › Base");
    expect(fieldLabel("encounters[1].room_type")).toBe(
      "Encounter 2 › Room type",
    );
    expect(fieldLabel("attack_pattern.branches[0].condition")).toBe(
      "Attack pattern › Branch 1 › Condition",
    );
  });

  it("hides pipeline-only fields", () => {
    expect(isInternalField("compendium_order")).toBe(true);
    expect(isInternalField("Compendium order")).toBe(true);
    expect(isInternalField("moves[BITE].id")).toBe(true);
    expect(isInternalField("encounters[0].encounter id")).toBe(true);
    expect(isInternalField("attack_pattern.states[SLEEP_MOVE].next")).toBe(
      true,
    );
    expect(isInternalField("attack_pattern.description")).toBe(false);
    expect(isInternalField("moves[BITE].powers[0].power_id")).toBe(false);
    expect(isInternalField("description")).toBe(false);
  });
});

describe("history values", () => {
  it("reads ids as names and empties as null", () => {
    expect(displayValue("WEAK")).toBe("Weak");
    expect(displayValue("HUNTER_KILLER_NORMAL")).toBe("Hunter Killer Normal");
    expect(displayValue("none")).toBeNull();
    expect(displayValue(null)).toBeNull();
    expect(displayValue("Deal 10 damage.")).toBe("Deal 10 damage.");
    expect(displayValue("3")).toBe("3");
    expect(displayValue("A")).toBe("A");
    expect(displayValue("1 fields")).toBe("1 field");
    expect(displayValue("2 fields")).toBe("2 fields");
  });

  it("drops hidden and unchanged rows", () => {
    const rows = [
      { field: "compendium_order", old: "352", new: "353" },
      { field: "encounters", old: "none", new: "none" },
      { field: "moves[BITE].damage.normal", old: "7", new: "8" },
    ];
    expect(visibleChanges(rows)).toEqual([rows[2]]);
  });

  it("drops the damage table copy of a move damage change", () => {
    const rows = [
      { field: "damage_values.Bite.normal", old: "7", new: "8" },
      { field: "moves[BITE].damage.normal", old: "7", new: "8" },
    ];
    expect(visibleChanges(rows)).toEqual([rows[1]]);
    expect(visibleChanges([rows[0]])).toEqual([rows[0]]);
  });
});

describe("prebuilt change lines", () => {
  it("splits a label and its two sides", () => {
    expect(parseChangeLine("Merchant price.base: 200 → 175")).toEqual({
      field: "Merchant price.base",
      old: "200",
      new: "175",
    });
  });

  it("keeps arrows that belong to a value", () => {
    expect(
      parseChangeLine(
        "Attack pattern.description: Sleep → Wake → Slashes → none",
      ),
    ).toEqual({
      field: "Attack pattern.description",
      old: "Sleep → Wake → Slashes",
      new: "none",
    });
    expect(
      parseChangeLine("Attack pattern.description: none → Sleep → Wake"),
    ).toEqual({
      field: "Attack pattern.description",
      old: "none",
      new: "Sleep → Wake",
    });
    expect(
      parseChangeLine("Attack pattern.description: A → B → C → D"),
    ).toEqual({
      field: "Attack pattern.description",
      old: "A → B",
      new: "C → D",
    });
  });

  it("leaves prose alone", () => {
    expect(parseChangeLine("Added.")).toBeNull();
    expect(parseChangeLine("Pattern: A → B → C")).toBeNull();
  });
});
