import { describe, expect, it } from "vitest";
import { roomTypeTitle } from "./run-names";
import type { Floor } from "@/lib/api/run/types";

const game: Record<string, string> = {
  "static_hover_tips.ROOM_ELITE.title": "Elite",
  "static_hover_tips.ROOM_UNKNOWN_ELITE.title": "Unknown Elite",
  "static_hover_tips.ROOM_BOSS.title": "Boss",
  "static_hover_tips.ROOM_REST.title": "Rest Site",
};
const gt = (key: string) => game[key];
const t = (key: string) => `ui:${key}`;

const floor = (over: Partial<Floor>): Floor => ({
  was_unknown: false,
  raw_type: "elite",
  floor_type: "ENCOUNTER",
  rooms: [
    {
      type: "ENCOUNTER",
      encounter_type: "ELITE",
      id: "X_ELITE",
      monsters: [],
      turns_taken: 2,
    },
  ],
  player_stats: [],
  ...over,
});

describe("roomTypeTitle", () => {
  it("uses the game's label for a revealed room", () => {
    expect(roomTypeTitle(floor({}), gt, t)).toBe("Elite");
  });

  it("uses the game's unknown-room label when it exists", () => {
    expect(
      roomTypeTitle(floor({ was_unknown: true, raw_type: "unknown" }), gt, t),
    ).toBe("Unknown Elite");
  });

  it("never reveals an unknown room through the known label", () => {
    const boss = floor({
      was_unknown: true,
      raw_type: "unknown",
      rooms: [
        {
          type: "ENCOUNTER",
          encounter_type: "BOSS",
          id: "Y_BOSS",
          monsters: [],
        },
      ],
    });
    expect(roomTypeTitle(boss, gt, t)).toBe("ui:Unknown");
  });

  it("falls back to the UI label, then the raw type", () => {
    const shop = floor({
      raw_type: "shop",
      floor_type: "MERCHANT",
      rooms: [{ type: "MERCHANT" }],
    });
    expect(roomTypeTitle(shop, gt, t)).toBe("ui:Shop");
    const modded = floor({
      raw_type: "lab",
      floor_type: undefined,
      rooms: [{ room_type: "lab" }],
    });
    expect(roomTypeTitle(modded, gt, t)).toBe("lab");
  });
});
