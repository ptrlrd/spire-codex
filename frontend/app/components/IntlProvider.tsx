"use client";

import { NextIntlClientProvider } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { unsafeKey } from "@/lib/i18n-keys";

// Client-side twin of i18n/request.ts. The catalog is derived from the same
// string tables here instead of being inlined into every page's HTML, so it
// travels once in a cached chunk (as the tables always did). A key with no
// message renders as its English text instead of logging.
export default function IntlProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const messages = useMemo(() => messagesFor(locale), [locale]);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="America/Los_Angeles"
      getMessageFallback={({ key }) => unsafeKey(key)}
      onError={(error) => {
        if (error.code !== "MISSING_MESSAGE") console.error(error);
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
