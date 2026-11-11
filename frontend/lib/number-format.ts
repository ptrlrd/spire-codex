import { LANG_HREFLANG, type LangCode } from "./languages";

export type NumberFormatter = (
  n: number,
  opts?: Intl.NumberFormatOptions,
) => string;

export function numberLocale(locale: string): string {
  return LANG_HREFLANG[locale as LangCode] ?? "en-US";
}

export function formatNumber(
  n: number,
  locale: string,
  opts?: Intl.NumberFormatOptions,
): string {
  return n.toLocaleString(numberLocale(locale), opts);
}

export function numberFormatter(locale: string): NumberFormatter {
  const tag = numberLocale(locale);
  return (n, opts) => n.toLocaleString(tag, opts);
}
