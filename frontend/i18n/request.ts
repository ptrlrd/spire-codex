import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { unsafeKey } from "@/lib/i18n-keys";
import { messagesFor } from "./messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: messagesFor(locale),
    timeZone: "America/Los_Angeles",
    // A key with no message renders as its English text, which is what the
    // old t() did; dynamic keys (room kinds, outcome labels) rely on it.
    getMessageFallback: ({ key }) => unsafeKey(key),
    onError: (error) => {
      if (error.code !== "MISSING_MESSAGE") console.error(error);
    },
  };
});
