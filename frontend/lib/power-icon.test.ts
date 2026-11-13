import { describe, expect, it } from "vitest";
import { powerIconUrl } from "./power-icon";

const powers = {
  DEXTERITY: { image_url: "/static/images/powers/dexterity_power.webp" },
  AIM: { image_url: "/static/images/beta/v0.113.0/powers/aim_power.webp" },
  QUIETUS: { image_url: null },
};

describe("powerIconUrl", () => {
  it("uses the catalog path, so a beta-only power resolves to its beta art", () => {
    expect(powerIconUrl("AIM_POWER", powers)).toContain(
      "beta/v0.113.0/powers/aim_power.webp",
    );
    expect(powerIconUrl("DEXTERITY_POWER", powers)).toContain(
      "powers/dexterity_power.webp",
    );
  });

  it("asks for nothing while the catalog is loading or when a power has no art", () => {
    expect(powerIconUrl("AIM_POWER", {})).toBeNull();
    expect(powerIconUrl("QUIETUS_POWER", powers)).toBeNull();
  });

  it("guesses the root path only for an id the catalog does not know", () => {
    expect(powerIconUrl("MYSTERY_POWER", powers, "png")).toContain(
      "powers/mystery_power.png",
    );
  });
});
