"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Settled<T> {
  key: string;
  data: T | null;
  failed: boolean;
}

export interface FilterFetch<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export function startFilterFetch<T>(
  url: string,
  debounceMs: number,
  onSettled: (data: T | null, failed: boolean) => void,
  fetchImpl: typeof fetch = fetch,
): () => void {
  const controller = new AbortController();
  const run = () => {
    fetchImpl(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<T>;
      })
      .then(
        (data) => {
          if (!controller.signal.aborted) onSettled(data, false);
        },
        () => {
          if (!controller.signal.aborted) onSettled(null, true);
        },
      );
  };
  const timer = debounceMs > 0 ? setTimeout(run, debounceMs) : null;
  if (timer === null) run();
  return () => {
    if (timer !== null) clearTimeout(timer);
    controller.abort();
  };
}

export function filterFetchView<T>(
  settled: Settled<T> | null,
  key: string | null,
): Omit<FilterFetch<T>, "retry"> {
  const current = settled !== null && settled.key === key;
  return {
    data: settled?.data ?? null,
    loading: key !== null && !current,
    error: current && settled.failed,
  };
}

/** Loads JSON for a filter-driven URL. A new URL aborts the request before
 *  it, so an older response can never replace a newer one; `debounceMs`
 *  delays every request after the first, for inputs that change per
 *  keystroke. Pass null to fetch nothing. `data` keeps the last good
 *  response while the next loads and is null after a failure; `error` is
 *  true only when the current URL's request failed. */
export function useFilterFetch<T>(
  url: string | null,
  options: { debounceMs?: number } = {},
): FilterFetch<T> {
  const debounceMs = options.debounceMs ?? 0;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const started = useRef(false);
  const key = url === null ? null : `${attempt} ${url}`;
  useEffect(() => {
    if (url === null || key === null) return;
    const wait = started.current ? debounceMs : 0;
    started.current = true;
    return startFilterFetch<T>(url, wait, (data, failed) =>
      setSettled({ key, data, failed }),
    );
  }, [url, key, debounceMs]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...filterFetchView(settled, key), retry };
}

export interface FilterPageState {
  key: string;
  page: number;
}

export function filterPageFor(
  state: FilterPageState,
  filterKey: string,
): FilterPageState {
  return state.key === filterKey ? state : { key: filterKey, page: 1 };
}

export function useFilterPage(
  filterKey: string,
  initialPage = 1,
): [number, (page: number) => void] {
  const [state, setState] = useState<FilterPageState>({
    key: filterKey,
    page: initialPage,
  });
  const current = filterPageFor(state, filterKey);
  if (current !== state) setState(current);
  const setPage = useCallback(
    (next: number) => setState({ key: filterKey, page: next }),
    [filterKey],
  );
  return [current.page, setPage];
}
