export type PollRound = (isCurrent: () => boolean) => void | Promise<unknown>;

const STALL_BEATS = 4;

/** Runs `fn` one round at a time. A tick that lands while a round is still
 *  in flight is skipped; a round stuck for several beats is given up on so
 *  polling recovers, and `isCurrent` then tells that round its result is
 *  stale. */
export function createPoller(
  fn: PollRound,
  ms: number,
  now: () => number = Date.now,
) {
  let round = 0;
  let busy = false;
  let startedAt = 0;
  let stopped = false;
  return {
    tick() {
      if (stopped) return;
      if (busy && now() - startedAt < ms * STALL_BEATS) return;
      const mine = ++round;
      busy = true;
      startedAt = now();
      const done = () => {
        if (mine === round) busy = false;
      };
      let result: void | Promise<unknown>;
      try {
        result = fn(() => !stopped && mine === round);
      } catch {
        done();
        return;
      }
      Promise.resolve(result).then(done, done);
    },
    stop() {
      stopped = true;
    },
  };
}
