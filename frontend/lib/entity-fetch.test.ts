import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEntityRes } from "./entity-fetch";

function stub(status: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(status === 204 ? null : "{}", { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchEntityRes", () => {
  it("returns OK responses", async () => {
    stub(200);
    expect((await fetchEntityRes("http://api/x")).status).toBe(200);
  });

  it.each([404, 410])("returns a %i so the page can decide the entity is missing", async (status) => {
    stub(status);
    expect((await fetchEntityRes("http://api/x")).status).toBe(status);
  });

  it.each([429, 401, 403, 500, 502, 503])("throws on %i instead of reading it as missing", async (status) => {
    stub(status);
    await expect(fetchEntityRes("http://api/x")).rejects.toThrow(`entity API ${status}`);
  });
});
