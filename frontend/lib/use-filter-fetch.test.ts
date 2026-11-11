import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterFetchView, startFilterFetch } from "./use-filter-fetch";

interface Call {
  url: string;
  signal: AbortSignal;
  respond: (status: number, body: unknown) => void;
  fail: () => void;
}

function fakeFetch() {
  const calls: Call[] = [];
  const impl = ((url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({
        url,
        signal: init!.signal!,
        respond: (status, body) =>
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => {
              if (body instanceof Error) throw body;
              return body;
            },
          } as Response),
        fail: () => reject(new TypeError("network")),
      });
    })) as typeof fetch;
  return { calls, impl };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("startFilterFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the parsed body of an ok response", async () => {
    const { calls, impl } = fakeFetch();
    const settled = vi.fn();
    startFilterFetch("/a", 0, settled, impl);
    expect(calls.map((c) => c.url)).toEqual(["/a"]);
    calls[0].respond(200, { runs: [1] });
    await flush();
    expect(settled.mock.calls).toEqual([[{ runs: [1] }, false]]);
  });

  it("reports a failure for a non-ok response instead of its body", async () => {
    const { calls, impl } = fakeFetch();
    const settled = vi.fn();
    startFilterFetch("/a", 0, settled, impl);
    calls[0].respond(500, { detail: "boom" });
    await flush();
    expect(settled.mock.calls).toEqual([[null, true]]);
  });

  it("reports a failure for a network error and for a body that is not JSON", async () => {
    const { calls, impl } = fakeFetch();
    const settled = vi.fn();
    startFilterFetch("/a", 0, settled, impl);
    startFilterFetch("/b", 0, settled, impl);
    calls[0].fail();
    calls[1].respond(200, new SyntaxError("bad json"));
    await flush();
    expect(settled.mock.calls).toEqual([
      [null, true],
      [null, true],
    ]);
  });

  it("aborts on cancel so an older response cannot land after a newer one", async () => {
    const { calls, impl } = fakeFetch();
    const seen: string[] = [];
    const cancelFirst = startFilterFetch<string>(
      "/old",
      0,
      (d) => seen.push(String(d)),
      impl,
    );
    cancelFirst();
    startFilterFetch<string>("/new", 0, (d) => seen.push(String(d)), impl);
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    calls[1].respond(200, "new");
    await flush();
    calls[0].respond(200, "old");
    await flush();
    expect(seen).toEqual(["new"]);
  });

  it("stays silent when a cancelled request fails", async () => {
    const { calls, impl } = fakeFetch();
    const settled = vi.fn();
    const cancel = startFilterFetch("/a", 0, settled, impl);
    cancel();
    calls[0].fail();
    await flush();
    expect(settled).not.toHaveBeenCalled();
  });

  it("waits out the debounce and sends only the last of a burst", async () => {
    const { calls, impl } = fakeFetch();
    const settled = vi.fn();
    let cancel = startFilterFetch("/?u=a", 250, settled, impl);
    vi.advanceTimersByTime(100);
    cancel();
    cancel = startFilterFetch("/?u=ab", 250, settled, impl);
    vi.advanceTimersByTime(100);
    cancel();
    startFilterFetch("/?u=abc", 250, settled, impl);
    vi.advanceTimersByTime(249);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.map((c) => c.url)).toEqual(["/?u=abc"]);
    calls[0].respond(200, []);
    await flush();
    expect(settled.mock.calls).toEqual([[[], false]]);
  });
});

describe("filterFetchView", () => {
  it("is idle with no URL", () => {
    expect(filterFetchView(null, null)).toEqual({
      data: null,
      loading: false,
      error: false,
    });
  });

  it("is loading until the current key settles and keeps the last data meanwhile", () => {
    expect(filterFetchView(null, "0 /a")).toEqual({
      data: null,
      loading: true,
      error: false,
    });
    expect(
      filterFetchView({ key: "0 /a", data: [1], failed: false }, "0 /b"),
    ).toEqual({ data: [1], loading: true, error: false });
  });

  it("tells a failure apart from an empty result", () => {
    expect(
      filterFetchView({ key: "0 /a", data: [], failed: false }, "0 /a"),
    ).toEqual({ data: [], loading: false, error: false });
    expect(
      filterFetchView({ key: "0 /a", data: null, failed: true }, "0 /a"),
    ).toEqual({ data: null, loading: false, error: true });
  });

  it("does not carry an old failure over to a new key or a retry", () => {
    const failed = { key: "0 /a", data: null, failed: true };
    expect(filterFetchView(failed, "0 /b").error).toBe(false);
    expect(filterFetchView(failed, "1 /a")).toEqual({
      data: null,
      loading: true,
      error: false,
    });
  });
});
