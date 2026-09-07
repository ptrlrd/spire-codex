import { defineRouting } from "next-intl/routing";
import { SUPPORTED_LANGS } from "@/lib/languages";

// English lives at the bare path, every other language under its game code
// (/jpn/cards). No Accept-Language redirects and no locale cookie: the URL
// is the only authority, so crawlers and caches see one page per URL.
export const routing = defineRouting({
  locales: ["eng", ...SUPPORTED_LANGS],
  defaultLocale: "eng",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
