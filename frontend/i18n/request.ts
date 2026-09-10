import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { unsafeKey } from "@/lib/i18n-keys";
import { messagesFor } from "./messages";
import { routing } from "./routing";
import { dataMessagesFor } from "./dataMessages";

// note: requestLocale is no longer recommended (see next-intl docs)
// relatedly, we should consider using multiple root-params in order to detect when the page is on beta (havent looked into details or alternatives yet)
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  return {
    locale,
    messages: {
      messagesFor(locale),
      data: { main: dataMessagesFor(locale, false), beta: dataMessagesFor(locale, true) },
    },
    timeZone: "America/Los_Angeles",
    // A key with no message renders as its English text, which is what the
    // old t() did; dynamic keys (room kinds, outcome labels) rely on it.
    getMessageFallback: ({ key }: { key: string }) => {
      // Note: recommending against generic fallback for the dataMessages pattern;
      // Instead we should leverage .has(key) checks and decide how to fall back in context-aware ways in the component.
      // Generally, falling back to English should not be available and this is deliberate.
      // Instead, we should fail-fast so we can detect bugs even in the English version.
      // I'm considering straight up through an error here.
      // However, this will be important for things like runs with mods in them, where we won't have an English equivalent but can extract a fallback value from the run itself.
      if (key.startsWith("data.")) {
        return "BAD_GAME_TRANSLATION_LOOKUP";
      }
      unsafeKey(key);
    },
    onError: (error) => {
      if (error.code !== "MISSING_MESSAGE") console.error(error);
    },
  };
});
