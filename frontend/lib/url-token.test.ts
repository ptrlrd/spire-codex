import { describe, expect, it } from "vitest";
import { acceptsUrlToken } from "./url-token";

describe("acceptsUrlToken", () => {
  it("ignores a URL token when the API shares the page origin", () => {
    expect(acceptsUrlToken("", "https://spire-codex.com")).toBe(false);
    expect(
      acceptsUrlToken("https://spire-codex.com", "https://spire-codex.com"),
    ).toBe(false);
    expect(acceptsUrlToken("/api", "https://spire-codex.com")).toBe(false);
  });

  it("takes a URL token when the API is on another origin", () => {
    expect(
      acceptsUrlToken("http://localhost:8000", "http://localhost:3000"),
    ).toBe(true);
    expect(
      acceptsUrlToken("https://spire-codex.com", "http://localhost:3000"),
    ).toBe(true);
  });

  it("ignores a URL token when the origins cannot be compared", () => {
    expect(acceptsUrlToken("http://[bad", "https://spire-codex.com")).toBe(
      false,
    );
    expect(acceptsUrlToken("", "not an origin")).toBe(false);
  });
});
