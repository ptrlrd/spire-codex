"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { safeKey } from "./i18n-keys";
import type { Locale } from "@/i18n/routing";

export type TValues = Record<string, string | number>;
export type TFn = (key: string, values?: TValues) => string;

/** The UI string for `key` (English display text) in the page's locale. */
export function useT(): TFn {
  const t = useTranslations();
  return useCallback((key: string, values?: TValues) => t(safeKey(key), values), [t]);
}

/** The page's locale as the game code the API and asset paths use. */
export function useGameLocale(): Locale {
  return useLocale() as Locale;
}
