import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

import { notFound, permanentRedirect } from "next/navigation";
import { redirectMissingEntity } from "./redirect-helpers";

describe("redirectMissingEntity", () => {
  it("returns a real 404 for an unknown id instead of redirecting to the hub", () => {
    expect(() => redirectMissingEntity("cards", "no_such_card")).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("308s a documented rename to the new id, keeping the locale prefix", () => {
    const legacy = { cards: { old_slug: "new_slug" } };
    expect(() => redirectMissingEntity("cards", "old_slug", "fra", legacy)).toThrow("NEXT_REDIRECT:/fra/cards/new_slug");
    expect(() => redirectMissingEntity("cards", "old_slug", undefined, legacy)).toThrow("NEXT_REDIRECT:/cards/new_slug");
    expect(() => redirectMissingEntity("relics", "old_slug", "fra", legacy)).toThrow("NEXT_NOT_FOUND");
  });
});
