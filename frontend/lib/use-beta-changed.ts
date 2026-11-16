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

export function useBetaChanged(type: string): ReadonlySet<string> {
  const channel = useChannel();
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY);
  useEffect(() => {
    if (channel === "beta") return;
    let active = true;
    cachedFetch<BetaDiff>(`${API}/api/beta/diff`)
      .then((d) => {
        if (active && d?.beta_version)
          setIds(new Set(Object.keys(d.types?.[type]?.changed ?? {})));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [channel, type]);
  return channel === "beta" ? EMPTY : ids;
}
