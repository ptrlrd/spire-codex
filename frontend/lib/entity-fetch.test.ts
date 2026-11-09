import { afterEach, describe, expect, it, vi } from "vitest";
import { betaOnlyVersion, fetchEntityRes } from "./entity-fetch";

function stub(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(status === 204 ? null : "{}", { status })),
  );
}

function stubBeta(added: string[], betaStatus = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/api/beta/diff"))
        return Response.json({
          beta_version: "v0.112.0",
          types: { cards: { added } },
        });
      if (/[?&]channel=beta/.test(url))
        return new Response(JSON.stringify({ id: "NEW_CARD" }), {
          status: betaStatus,
        });
      return new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchEntityRes", () => {
  it("returns OK responses", async () => {
    stub(200);
    expect((await fetchEntityRes("http://api/x")).status).toBe(200);
  });

  it.each([404, 410])(
    "returns a %i so the page can decide the entity is missing",
    async (status) => {
      stub(status);
      expect((await fetchEntityRes("http://api/x")).status).toBe(status);
    },
  );

  it.each([429, 401, 403, 500, 502, 503])(
    "throws on %i instead of reading it as missing",
    async (status) => {
      stub(status);
      await expect(fetchEntityRes("http://api/x")).rejects.toThrow(
        `entity API ${status}`,
      );
    },
  );

  it("serves a beta-only id from the beta channel and marks the response", async () => {
    const calls = stubBeta(["NEW_CARD"]);
    const res = await fetchEntityRes("http://api/api/cards/new_card?lang=deu");
    expect(res.status).toBe(200);
    expect(betaOnlyVersion(res)).toBe("v0.112.0");
    expect(await res.json()).toEqual({ id: "NEW_CARD" });
    expect(calls).toContain(
      "http://api/api/cards/new_card?lang=deu&channel=beta",
    );
  });

  it("keeps the 404 when the id is not a beta addition", async () => {
    const calls = stubBeta(["OTHER"]);
    const res = await fetchEntityRes("http://api/api/cards/new_card");
    expect(res.status).toBe(404);
    expect(betaOnlyVersion(res)).toBeNull();
    expect(calls.some((u) => u.includes("channel=beta"))).toBe(false);
  });

  it("keeps the 404 when the beta channel has no row either", async () => {
    stubBeta(["NEW_CARD"], 404);
    const res = await fetchEntityRes("http://api/api/cards/new_card");
    expect(res.status).toBe(404);
  });

  it("leaves 410 alone", async () => {
    stub(410);
    expect(
      betaOnlyVersion(await fetchEntityRes("http://api/api/cards/x")),
    ).toBeNull();
  });
});
