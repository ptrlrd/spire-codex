import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCardDisplayModel, getCardProseFacts } from "./card-display";
import type { Card } from "./api/types";

const cards: Card[] = JSON.parse(
  readFileSync(join(__dirname, "../../data/eng/cards.json"), "utf8"),
);
const upgradable = cards.filter((c) => c.upgrade || c.upgrade_description);

describe("upgrade toggle across the whole catalog", () => {
  it("every upgradable card visibly changes when toggled", () => {
    const inert: string[] = [];
    for (const c of upgradable) {
      const base = getCardDisplayModel(c, false);
      const up = getCardDisplayModel(c, true);
      const changed =
        base.descriptionText !== up.descriptionText ||
        base.damage !== up.damage ||
        base.block !== up.block ||
        base.cost !== up.cost ||
        base.hitCount !== up.hitCount ||
        JSON.stringify([base.visibleKeywords, base.addedKeywords]) !==
          JSON.stringify([up.visibleKeywords, up.addedKeywords]);
      if (!changed) inert.push(c.id);
    }
    expect(inert).toEqual([]);
  });

  it("prose facts follow the toggle for every upgradable card", () => {
    for (const c of upgradable) {
      const base = getCardProseFacts(c, false);
      const up = getCardProseFacts(c, true);
      expect(up.isUpgraded).toBe(true);
      expect(up.displayName).toBe(`${c.name}+`);
      expect(base.displayName).toBe(c.name);
      if (up.damageChanged) expect(up.damage).not.toBe(base.damage);
      if (up.blockChanged) expect(up.block).not.toBe(base.block);
    }
  });

  it("X-cost multi-hit cards say X times", () => {
    const xTimes = cards.filter((c) =>
      /damage(?: to [a-z ]+?)? X(?:\+\d+)? times/i.test(c.description || ""),
    );
    expect(xTimes.length).toBeGreaterThanOrEqual(5);
    for (const c of xTimes) {
      expect(getCardProseFacts(c, false).xTimes).toBe(true);
      if (c.upgrade_description) {
        expect(getCardProseFacts(c, true).xTimes).toBe(true);
      }
    }
  });

  it("no damage clause hides a multiplicity stated in the description", () => {
    const hidden: string[] = [];
    for (const c of cards) {
      const f = getCardProseFacts(c, false);
      if (f.damage == null) continue;
      const desc = c.description || "";
      // Damage-adjacent multiplicity only: "twice as effective" or a
      // conditional "hits twice" elsewhere in the text is not a damage claim.
      const multi =
        /damage(?: to [a-z ]+?)? (?:twice|\d+ times|X(?:\+\d+)? times)\b/i.test(
          desc,
        );
      const covered = (f.hitCount && f.hitCount > 1) || f.xTimes;
      if (multi && !covered) hidden.push(c.id);
    }
    expect(hidden).toEqual([]);
  });
});
