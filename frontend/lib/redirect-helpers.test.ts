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

  it("does the same on a localized route", () => {
    expect(() => redirectMissingEntity("events", "no_such_event", "fra")).toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
