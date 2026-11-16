import { expect, it } from "vitest";
import { orbIconPath } from "./orb-icon";

it("builds the same icon path from either id form the mod sends", () => {
  expect(orbIconPath("FROST_ORB")).toBe("/static/images/orbs/frost_orb.png");
  expect(orbIconPath("ORB.LIGHTNING_ORB")).toBe(
    "/static/images/orbs/lightning_orb.png",
  );
  expect(orbIconPath("DARK")).toBe("/static/images/orbs/dark_orb.png");
});
