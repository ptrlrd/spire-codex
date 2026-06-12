"use client";

// Surfaces beta-only entities in the stable list pages: the hook resolves
// the current beta's added IDs for an entity type (from the cached diff
// index) and fetches each one from the beta channel. List components append
// these to their stable catalog with a Beta badge linking into /beta, so a
// player on the game's beta branch can find Aeonglass in the bestiary
// without knowing the /beta section exists. On beta paths it returns
// nothing, because there the list itself already comes from the beta
// catalog.

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface BetaDiff {
  beta_version: string | null;
  types: Record<string, { added: string[] }>;
}

export function useBetaAdditions<T extends { id: string }>(type: string, lang: string): T[] {
  const channel = useChannel();
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (channel === "beta") {
      setItems([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const diff = await cachedFetch<BetaDiff>(`${API}/api/beta/diff`);
        const added = diff?.beta_version ? (diff.types?.[type]?.added ?? []) : [];
        if (added.length === 0) {
          if (active) setItems([]);
          return;
        }
        const fetched = await Promise.all(
          added.map((id) =>
            cachedFetch<T>(`${API}/api/${type}/${id.toLowerCase()}?lang=${lang}&channel=beta`).catch(
              () => null,
            ),
          ),
        );
        if (active) setItems(fetched.filter(Boolean) as T[]);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [type, lang, channel]);

  return items;
}
