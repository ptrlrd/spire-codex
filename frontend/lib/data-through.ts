import type { Locale } from "@/i18n/routing";
import { hreflangOf } from "@/lib/locale";
import { fmtDateTimePacific } from "@/lib/pacific";

type TFn = (key: string, values?: Record<string, string | number>) => string;

const STYLE = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

export function dataThroughLabel(
  ts: string | null | undefined,
  t: TFn,
  lang: Locale,
): string | null {
  if (!ts) return null;
  return t("Data through {when} PT", {
    when: fmtDateTimePacific(ts, STYLE, hreflangOf(lang)),
  });
}
