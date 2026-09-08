"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import { unsafeKey } from "@/lib/i18n-keys";

// Client-side twin of i18n/request.ts. The layout resolves one locale's
// catalog on the server and hands it in, so the string tables (all 15
// languages, ~780 KB gzipped) never enter the client bundle. A key with no
// message renders as its English text instead of logging.
export default function IntlProvider({ locale, messages, children }: { locale: Locale; messages: Record<string, string>; children: ReactNode }) {
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
