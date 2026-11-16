"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/api/prefix.client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const EMPTY: ReadonlySet<string> = new Set();

interface BetaDiff {
  beta_version: string | null;
  types?: Record<string, { changed?: Record<string, unknown> }>;
}

interface BetaChanged {
  ids: ReadonlySet<string>;
  version: string | null;
}
const NONE: BetaChanged = { ids: EMPTY, version: null };

export function useBetaChanged(type: string): BetaChanged {
  const channel = useChannel();
  const [found, setFound] = useState<BetaChanged>(NONE);
  useEffect(() => {
    if (channel === "beta") return;
    let active = true;
    cachedFetch<BetaDiff>(`${API}/api/beta/diff`)
      .then((d) => {
        if (active && d?.beta_version)
          setFound({
            ids: new Set(Object.keys(d.types?.[type]?.changed ?? {})),
            version: d.beta_version,
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [channel, type]);
  return channel === "beta" ? NONE : found;
}
