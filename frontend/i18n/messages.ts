import { X1 } from "@/lib/i18n-x1";
import { X2 } from "@/lib/i18n-x2";
import { X3 } from "@/lib/i18n-x3";
import { X4 } from "@/lib/i18n-x4";
import { X5 } from "@/lib/i18n-x5";
import { UI_TRANSLATIONS } from "@/lib/ui-translations";
import { safeKey } from "@/lib/i18n-keys";
import type { Locale } from "./routing";

// The UI string tables stay the single source of truth (English text as the
// key, one column per language). This turns them into one flat catalog per
// locale for next-intl, once per process, with English filling any gap and
// ICU's apostrophe escaping applied so "Couldn't" renders as written.
const TABLES = [UI_TRANSLATIONS, X1, X2, X3, X4, X5];
const cache = new Map<string, Record<string, string>>();

function icu(text: string): string {
  return text.replace(/'/g, "''");
}

export function messagesFor(locale: Locale): Record<string, string> {
  const hit = cache.get(locale);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const table of TABLES) {
    for (const [key, entry] of Object.entries(table)) {
      out[safeKey(key)] = icu(entry[locale] || entry.eng || key);
    }
  }
  cache.set(locale, out);
  return out;
}
