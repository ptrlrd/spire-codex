import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiUrl } from "./fetch-cache";

const API = "https://example.test";

function onPath(pathname: string) {
  vi.stubGlobal("window", { location: { pathname } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildApiUrl", () => {
  it("gives every spelling of the main catalog one URL", () => {
    onPath("/cards");
    const want = `${API}/api/cards?lang=eng`;
    expect(buildApiUrl(`${API}/api/cards?lang=eng`)).toBe(want);
    expect(buildApiUrl(`${API}/api/cards?lang=eng&channel=stable`)).toBe(want);
    expect(buildApiUrl(`${API}/api/cards?channel=stable&lang=eng`)).toBe(want);
  });

  it("orders the query by key and keeps repeated keys in place", () => {
    onPath("/cards");
    expect(buildApiUrl(`${API}/api/cards?lang=jpn&channel=all`)).toBe(
      `${API}/api/cards?channel=all&lang=jpn`,
    );
    expect(buildApiUrl(`${API}/api/x?id=b&a=1&id=a`)).toBe(
      `${API}/api/x?a=1&id=b&id=a`,
    );
  });

  it("drops a lone channel=stable and its question mark", () => {
    onPath("/cards");
    expect(buildApiUrl(`${API}/api/stats?channel=stable`)).toBe(
      `${API}/api/stats`,
    );
  });

  it("keeps other channels and other parameter values untouched", () => {
    onPath("/cards");
    expect(buildApiUrl(`${API}/api/cards?channel=beta&lang=eng`)).toBe(
      `${API}/api/cards?channel=beta&lang=eng`,
    );
    expect(buildApiUrl(`${API}/api/search?q=a%20b%26c&lang=eng`)).toBe(
      `${API}/api/search?lang=eng&q=a%20b%26c`,
    );
  });

  it("adds the beta channel on a beta path and keeps an explicit one", () => {
    onPath("/jpn/beta/cards");
    expect(buildApiUrl(`${API}/api/cards?lang=jpn`)).toBe(
      `${API}/api/cards?channel=beta&lang=jpn`,
    );
    expect(buildApiUrl(`${API}/api/cards?lang=jpn&channel=stable`)).toBe(
      `${API}/api/cards?channel=stable&lang=jpn`,
    );
    expect(buildApiUrl(`${API}/api/cards?channel=all`)).toBe(
      `${API}/api/cards?channel=all`,
    );
  });

  it("leaves non-API URLs alone", () => {
    onPath("/beta/cards");
    expect(buildApiUrl("https://cdn.example.test/a.json?b=1&a=2")).toBe(
      "https://cdn.example.test/a.json?b=1&a=2",
    );
  });
});
