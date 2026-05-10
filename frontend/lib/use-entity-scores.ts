"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ScoreEntry {
  score: number | null;
  picks: number;
  wins: number;
  win_rate: number;
}

export type ScoresMap = Record<string, ScoreEntry>;

/**
 * Fetch every Codex Score for an entity type once, keyed by uppercase
 * ID. Backed by `cachedFetch` so concurrent calls dedupe and the
 * client-side cache survives soft navs. Use this on list pages to
 * surface tier badges without N round-trips per row.
 */
export function useEntityScores(entityType: "cards" | "relics" | "potions"): ScoresMap {
  const [scores, setScores] = useState<ScoresMap>({});

  useEffect(() => {
    cachedFetch<ScoresMap>(`${API}/api/runs/scores/${entityType}`)
      .then(setScores)
      .catch(() => setScores({}));
  }, [entityType]);

  return scores;
}
