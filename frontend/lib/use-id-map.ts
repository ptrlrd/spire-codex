"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useGameLocale } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Lazy id -> item map from a localized list endpoint, read from the merged
 * catalog (main plus the rows only the current beta has); refetches on a
 * locale change and only once enabled. */
export function useIdMap<T extends { id: string }>(
  path: string,
  enabled = true,
): Record<string, T> {
  const lang = useGameLocale();
  const [map, setMap] = useState<Record<string, T>>({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    cachedFetch<T[]>(`${API}${path}?lang=${lang}&channel=all`)
      .then((items) => {
        if (!live) return;
        const m: Record<string, T> = {};
        for (const x of items) m[x.id] = x;
        setMap(m);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, lang, path]);
  return map;
}
