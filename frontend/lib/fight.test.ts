import { describe, expect, it } from "vitest";
import type { Monster } from "@/lib/api/types";
import {
  fightMonster,
  groupFights,
  hpRange,
  intentIcons,
  moveDamage,
} from "./fight";

describe("intentIcons", () => {
  it("splits a compound intent into one icon each", () => {
    expect(intentIcons("Attack + Defend")).toEqual([
      { name: "Attack", src: "/static/images/intents/attack.png" },
      { name: "Defend", src: "/static/images/intents/defend.png" },
    ]);
  });

  it("falls back to the unknown icon", () => {
    expect(intentIcons(null)[0].src).toBe("/static/images/intents/unknown.png");
    expect(intentIcons("Mystery")[0].src).toBe(
      "/static/images/intents/unknown.png",
    );
  });
});

describe("fightMonster", () => {
  it("reads the opening intent from the pattern's first move", () => {
    const monster = {
      id: "AEONGLASS",
      image_url: "/a.webp",
      min_hp: 512,
      max_hp: null,
      moves: [
        { id: "LASER", name: "Laser", intent: "Attack" },
        { id: "EBB", name: "Ebb", intent: "Attack + Defend" },
      ],
      attack_pattern: { initial_move: "EBB" },
    } as unknown as Monster;
    expect(fightMonster(monster).first_intent).toBe("Attack + Defend");
  });
});

describe("hpRange and moveDamage", () => {
  it("formats ranges and multi hits", () => {
    expect(hpRange(40, 44)).toBe("40-44");
    expect(hpRange(512, null)).toBe("512");
    expect(hpRange(null, null)).toBeNull();
    expect(
      moveDamage({
        damage: { normal: 11, hit_count: 2 },
      } as never),
    ).toBe("11x2");
    expect(moveDamage({ damage: null } as never)).toBeNull();
  });
});

describe("groupFights", () => {
  it("groups by act, then weak fights before normal, elite and boss", () => {
    const row = (
      id: string,
      act: string | null,
      room_type: string,
      is_weak = false,
    ) => ({ id, act, room_type, is_weak });
    const groups = groupFights([
      row("boss", "Act 1 - Overgrowth", "Boss"),
      row("late", "Act 2 - Hive", "Monster"),
      row("norm", "Act 1 - Overgrowth", "Monster"),
      row("weak", "Act 1 - Overgrowth", "Monster", true),
      row("loose", null, "Monster"),
    ]);
    expect(groups.map((g) => g.act)).toEqual([
      "Act 1 - Overgrowth",
      "Act 2 - Hive",
      null,
    ]);
    expect(groups[0].rooms.map((r) => r.rows[0].id)).toEqual([
      "weak",
      "norm",
      "boss",
    ]);
  });
});
