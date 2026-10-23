"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { API } from "@/lib/api/endpoint.common";
import { useChannel } from "@/lib/api/prefix.client";
import { cachedFetch } from "@/lib/fetch-cache";
import { useGameLocale } from "@/lib/i18n";
import {
  GAME_ROOT,
  lookupGameMessage,
  type GameMessages,
  type GameValues,
} from "./game-messages.common";

export type TryGameT = (key: string, values?: GameValues) => string | undefined;

export function useGameTranslations(namespace?: string) {
  return useTranslations(namespace ? `${GAME_ROOT}.${namespace}` : GAME_ROOT);
}

/** The game's own string for a key, or undefined when the page's pack has
 * none; callers pick their own fallback. */
export function useTryGameTranslations(namespace?: string): TryGameT {
  const t = useGameTranslations(namespace);
  return useCallback(
    (key: string, values?: GameValues) => lookupGameMessage(t, key, values),
    [t],
  );
}

const EMPTY: GameMessages = {};

/** Whole localization tables fetched in one request for pages whose ids only
 * exist client side. Returns {} until they arrive. */
export function useGameTables(tables: string[], beta?: boolean): GameMessages {
  const lang = useGameLocale();
  const channel = useChannel(beta);
  const names = [...new Set(tables)].sort().join(",");
  const url = names
    ? `${API}/api/localizations?tables=${encodeURIComponent(names)}&lang=${lang}&channel=${channel}`
    : "";
  const [loaded, setLoaded] = useState<{
    url: string;
    messages: GameMessages;
  } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    cachedFetch<GameMessages>(url)
      .then((messages) => {
        if (!cancelled) setLoaded({ url, messages });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  return loaded?.url === url ? loaded.messages : EMPTY;
}
