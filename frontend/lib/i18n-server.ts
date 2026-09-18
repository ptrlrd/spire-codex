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

/**
 * Currently this assumes that beta-specific localisation will be handled at the requestConfiguration level;
 * The details on that are TODO.
 */
export async function getGameTranslations(args?: {
  locale?: Locale;
  namespace?: string;
  beta?: boolean;
}) {
  const branch = args?.beta ? "beta" : "main";
  const namespace = args?.namespace
    ? `data.${branch}.${args.namespace}`
    : `data.${branch}`;
  return args?.locale
    ? await getTranslations({
        locale: args.locale,
        namespace,
      })
    : await getTranslations(namespace);
}
/**
 * Currently this assumes that beta-specific localisation will be handled at the requestConfiguration level;
 * The details on that are TODO.
 */
export async function getTryGameTranslations(args?: {
  locale?: Locale;
  namespace?: string;
  beta?: boolean;
}) {
  const gT = await getGameTranslations(args);
  return (key: string) => (gT.has(key) ? gT(key) : undefined);
}
