import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPlayer } from "./player-lookup";

function stub(res: Response | Error) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("lookupPlayer", () => {
  it("returns the stored spelling for a real player", async () => {
    const spy = stub(json(200, { username: "Ada" }));
    expect(await lookupPlayer("ada lovelace")).toEqual({
      status: "found",
      username: "Ada",
    });
    expect(String(spy.mock.calls[0][0])).toContain(
      "/api/players/ada%20lovelace/profile",
    );
  });

  it("reads the API's own not-found as a missing player", async () => {
    stub(json(404, { detail: "Player not found" }));
    expect(await lookupPlayer("nobody")).toEqual({ status: "missing" });
  });

  it("does not read a missing route as a missing player", async () => {
    stub(json(404, { detail: "Not Found" }));
    expect(await lookupPlayer("ada")).toEqual({ status: "unknown" });
  });

  it("throws on a rate limit, a server error and an unreachable API", async () => {
    stub(json(429, { error: "slow down" }));
    await expect(lookupPlayer("ada")).rejects.toThrow("player API 429");
    stub(json(502, {}));
    await expect(lookupPlayer("ada")).rejects.toThrow("player API 502");
    stub(new Error("ECONNREFUSED"));
    await expect(lookupPlayer("ada")).rejects.toThrow("unreachable");
  });
});
