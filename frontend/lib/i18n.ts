"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useContext } from "react";
import { safeKey } from "./i18n-keys";
import type { Locale } from "@/i18n/routing";
import { ApiConfigContext } from "@/app/contexts/ApiConfigContext";

export type TValues = Record<string, string | number>;
export type TFn = (key: string, values?: TValues) => string;

/** The UI string for `key` (English display text) in the page's locale. */
export function useT(): TFn {
  const t = useTranslations();
  return useCallback(
    (key: string, values?: TValues) => t(safeKey(key), values),
    [t],
  );
}

/** The page's locale as the game code the API and asset paths use. */
export function useGameLocale(): Locale {
  return useLocale() as Locale;
}

/**
 * Currently this assumes that beta-specific localisation will be handled at the requestConfiguration level; we might change that to have this pull a context
 * The details on that are TODO.
 */
export function useGameTranslations(args?: {
  namespace?: string;
  beta?: boolean;
}) {
  const apiConfig = useContext(ApiConfigContext);
  const beta = args?.beta ?? apiConfig.beta;
  // we want the automatic return type, or else to reexport the actual type, with the .has on it
  const branch = beta ? "beta" : "main";
  return useTranslations(
    args?.namespace ? `data.${branch}.${args.namespace}` : `data.${branch}`,
  );
}

/**
 * Currently this assumes that beta-specific localisation will be handled at the requestConfiguration level;
 * The details on that are TODO.
 */
export function useTryGameTranslations(args?: {
  namespace?: string;
  beta?: boolean;
}) {
  const gT = useGameTranslations(args);
  return (key: string) => (gT.has(key) ? gT(key) : undefined);
}
