import { messagesFor } from "@/i18n/messages";
import { safeKey } from "./i18n-keys";
import { gameNameFor, nativeNameSuffix, type Locale } from "./locale";

/** The UI string for `key` in this locale, for server code that cannot await getT() (metadata helpers, JSON-LD). */
export function uiText(locale: Locale, key: string): string {
  const hit = messagesFor(locale)[safeKey(key)];
  return hit ? hit.replace(/''/g, "'") : key;
}

function kindText(locale: Locale, kind: string): string {
  const capital = kind.charAt(0).toUpperCase() + kind.slice(1);
  const hit = uiText(locale, capital);
  return hit === capital ? kind : hit;
}

/** JSON-LD description when the entity has none: English keeps the old phrasing, other locales use the localized kind. */
export function entityFallbackDescription(locale: Locale, name: string, kind: string): string {
  if (locale === "eng") return `${name} ${kind} from Slay the Spire 2`;
  return `${gameNameFor(locale)} ${kindText(locale, kind)}, ${name}`;
}

