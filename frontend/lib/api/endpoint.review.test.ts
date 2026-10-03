import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inBeta } from "./prefix.common";

vi.mock("@/lib/i18n-server", () => ({ getGameLocale: async () => "eng" }));

const { getApiEndpoint, getApiEndpointIdMapped } =
  await import("./endpoint.server");

describe("inBeta", () => {
  it.each([
    ["/beta/cards", true],
    ["/beta", true],
    ["/jpn/beta/cards", true],
    ["/cards", false],
    ["/jpn/cards", false],
    ["/betamax/cards", false],
    ["/", false],
  ])("%s -> %s", (path, want) => {
    expect(inBeta(path)).toBe(want);
  });
});

describe("getApiEndpoint", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends the locale and channel and passes revalidate through", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ cards: 612 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const stats = await getApiEndpoint(
      "stats",
      { beta: true },
      {
        timeoutMs: 3000,
        revalidate: 3600,
      },
    );
    expect(stats).toEqual({ cards: 612 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { next?: { revalidate?: number } },
    ];
    expect(url).toContain("/api/stats?lang=eng&channel=beta");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.next?.revalidate).toBe(3600);
  });

  it("returns undefined on a non-ok response", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 503 }));
    expect(await getApiEndpoint("stats")).toBeUndefined();
  });

  it("aborts a hung backend at the timeout", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const pending = getApiEndpoint("stats", undefined, { timeoutMs: 3000 });
    const settled = pending.then(
      () => "resolved",
      (e: Error) => e.name,
    );
    await vi.advanceTimersByTimeAsync(3001);
    expect(await settled).toBe("AbortError");
  });

  it("maps list endpoints by id", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify([{ id: "A" }, { id: "B" }]), {
          status: 200,
        }),
    );
    const byId = await getApiEndpointIdMapped("cards");
    expect(Object.keys(byId ?? {})).toEqual(["A", "B"]);
  });
});
