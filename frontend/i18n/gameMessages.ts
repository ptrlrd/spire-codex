import { Locale } from "./routing";

/**
 * Provides localised text directly from extracted game data, using a key/path matching the location in game data. each return is either for the current main or beta, depending on the flag.
 * Note: the use of the `translations` section should be avoided over a more canonical reference in another section.
 * - Partly because other sections consistently key by upper case ID.
 * - For this reason, some subsections of `translations`, like character names, are deliberately omitted.
 * - However, some keywords, especially rarities, are only available under the translations path.
 * Later, a TS signature might be provided for ease of reference?
 */
export async function dataMessagesFor(
  locale: Locale,
): Promise<Record<string, any>> {
  return (
    await import(`@/i18n/game/${locale}.json`, { with: { type: "json" } })
  ).default;
}
