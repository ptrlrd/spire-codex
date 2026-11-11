import { describe, expect, it } from "vitest";
import { createPoller } from "./poll";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createPoller", () => {
  it("skips ticks while a round is in flight and resumes after it", async () => {
    const gates = [deferred(), deferred()];
    let calls = 0;
    const poller = createPoller(
      () => gates[calls++].promise,
      1000,
      () => 0,
    );
    poller.tick();
    poller.tick();
    poller.tick();
    expect(calls).toBe(1);
    gates[0].resolve();
    await flush();
    poller.tick();
    expect(calls).toBe(2);
  });

  it("resumes after a round that rejects or throws", async () => {
    let calls = 0;
    const poller = createPoller(
      () => {
        calls++;
        if (calls === 1) return Promise.reject(new Error("x"));
        if (calls === 2) throw new Error("y");
      },
      1000,
      () => 0,
    );
    poller.tick();
    await flush();
    poller.tick();
    poller.tick();
    await flush();
    expect(calls).toBe(3);
  });

  it("gives up on a stuck round and marks it stale", async () => {
    let clock = 0;
    const gates = [deferred(), deferred()];
    const current: (() => boolean)[] = [];
    const poller = createPoller(
      (isCurrent) => {
        current.push(isCurrent);
        return gates[current.length - 1].promise;
      },
      1000,
      () => clock,
    );
    poller.tick();
    clock = 3999;
    poller.tick();
    expect(current.length).toBe(1);
    clock = 4000;
    poller.tick();
    expect(current.length).toBe(2);
    expect(current[0]()).toBe(false);
    expect(current[1]()).toBe(true);
    gates[0].resolve();
    await flush();
    poller.tick();
    expect(current.length).toBe(2);
    gates[1].resolve();
    await flush();
    poller.tick();
    expect(current.length).toBe(3);
  });

  it("marks every round stale and stops ticking once stopped", () => {
    const current: (() => boolean)[] = [];
    const poller = createPoller(
      (isCurrent) => {
        current.push(isCurrent);
        return new Promise(() => {});
      },
      1000,
      () => 0,
    );
    poller.tick();
    poller.stop();
    expect(current[0]()).toBe(false);
    poller.tick();
    expect(current.length).toBe(1);
  });
});
