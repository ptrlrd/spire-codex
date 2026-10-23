import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE_TABLES, REPLAY_TABLES } from "./game-messages.common";

const APP = join(__dirname, "..", "app", "[locale]");
const CALL = /(?:\bgt|cat\.gt\?\.)\(`([a-z_]+)\./g;

function tablesReadBy(files: string[]): string[] {
  const out = new Set<string>();
  for (const file of files) {
    const text = readFileSync(join(APP, file), "utf8");
    for (const m of text.matchAll(CALL)) out.add(m[1]);
  }
  return [...out].sort();
}

const PILLS = ["runs/[hash]/RunPills.tsx"];
const LIVE = [
  "live/LiveClient.tsx",
  "live/live-shared.tsx",
  "live/LiveEventShop.tsx",
  "live/LiveMap.tsx",
  "live/[steamId]/LivePlayerClient.tsx",
  "live/[steamId]/LiveScene.tsx",
];
const REPLAY = [
  "runs/[hash]/replay/ReplayClient.tsx",
  "runs/[hash]/replay/FloorPanel.tsx",
];

describe("client-side table lists", () => {
  it("LIVE_TABLES covers every table the pills and live pages read", () => {
    const read = tablesReadBy([...PILLS, ...LIVE]);
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((t) => !LIVE_TABLES.includes(t))).toEqual([]);
  });

  it("REPLAY_TABLES covers every table the replay reads", () => {
    const read = tablesReadBy([...PILLS, ...REPLAY]);
    expect(read).toContain("characters");
    expect(read.filter((t) => !REPLAY_TABLES.includes(t))).toEqual([]);
  });
});
