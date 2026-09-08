import { messagesFor } from "@/i18n/messages";
import { safeKey } from "./i18n-keys";
import { gameNameFor, nativeNameSuffix, type Locale } from "./locale";

/** The UI string for `key` in this locale, for server code that cannot await getT() (metadata helpers, JSON-LD). */
export function uiText(locale: Locale, key: string): string {
  const hit = messagesFor(locale)[safeKey(key)];
  return hit ? hit.replace(/''/g, "'") : key;
}

/** Title for a localized entity page: "<game> <name> - Relic | Spire Codex (日本語)". */
export function entityTitle(locale: Locale, name: string, kind: string): string {
  return `${gameNameFor(locale)} ${name} - ${uiText(locale, kind)} | Spire Codex${nativeNameSuffix(locale)}`;
}

function kindText(locale: Locale, kind: string): string {
  const capital = kind.charAt(0).toUpperCase() + kind.slice(1);
  const hit = uiText(locale, capital);
  return hit === capital ? kind : hit;
}

/** Meta description for a localized entity page, built around the localized description. */
export function entityDescription(locale: Locale, name: string, kind: string, desc: string): string {
  const text = `${gameNameFor(locale)} ${kindText(locale, kind)}, ${name}${desc ? `: ${desc}` : ""}`;
  return text.length > 155 ? `${text.slice(0, 152).trimEnd()}...` : text;
}

/** JSON-LD description when the entity has none: English keeps the old phrasing, other locales use the localized kind. */
export function entityFallbackDescription(locale: Locale, name: string, kind: string): string {
  if (locale === "eng") return `${name} ${kind} from Slay the Spire 2`;
  return `${gameNameFor(locale)} ${kindText(locale, kind)}, ${name}`;
}

