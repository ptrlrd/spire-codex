import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { safeKey } from "./i18n-keys";
import type { TFn, TValues } from "./i18n";

/** Server-side counterpart of useT(): resolves the request's locale. */
export async function getT(locale?: Locale): Promise<TFn> {
  const t = await getTranslations(locale ? { locale } : undefined);
  return (key: string, values?: TValues) => t(safeKey(key), values);
}

export async function getGameLocale(): Promise<Locale> {
  return (await getLocale()) as Locale;
}
