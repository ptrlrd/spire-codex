"use client";

import { useEffect } from "react";
import { LANG_HREFLANG, isValidLang, type LangCode } from "@/lib/languages";

// The root layout hardcodes <html lang="en"> and can't see the [lang]
// segment (reading it there would force every page dynamic). This sets the
// real BCP 47 code after hydration so browsers, translators, and screen
// readers treat localized pages as their actual language, and restores
// "en" when navigating back to English pages.
export default function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const code = isValidLang(lang) ? LANG_HREFLANG[lang as LangCode] : "en";
    document.documentElement.lang = code;
    return () => {
      document.documentElement.lang = "en";
    };
  }, [lang]);
  return null;
}
