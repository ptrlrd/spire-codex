"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "deu", name: "Deutsch" },
  { code: "eng", name: "English" },
  { code: "esp", name: "Español (ES)" },
  { code: "fra", name: "Français" },
  { code: "ita", name: "Italiano" },
  { code: "jpn", name: "日本語" },
  { code: "kor", name: "한국어" },
  { code: "pol", name: "Polski" },
  { code: "ptb", name: "Português (BR)" },
  { code: "rus", name: "Русский" },
  { code: "spa", name: "Español (LA)" },
  { code: "tha", name: "ไทย" },
  { code: "tur", name: "Türkçe" },
  { code: "zhs", name: "简体中文" },
];

const LANG_CODES = new Set(LANGUAGES.map((l) => l.code).filter((c) => c !== "eng"));
const STORAGE_KEY = "spire-codex-lang";

interface LanguageContextType {
  lang: string;
  setLang: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "eng",
  setLang: () => {},
});

/**
 * Get language from URL path first, then localStorage, then default to English.
 * URL always takes priority — if you're on /jpn/cards, lang is "jpn".
 */
function getLangFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const first = window.location.pathname.split("/")[1];
  if (first && LANG_CODES.has(first)) return first;
  return null;
}

function getInitialLang(): string {
  // URL takes priority
  const urlLang = getLangFromUrl();
  if (urlLang) return urlLang;

  // Then localStorage
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) {
      return stored;
    }
  }
  return "eng";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(getInitialLang);
  const pathname = usePathname();

  // Sync language from URL on every navigation
  useEffect(() => {
    const first = pathname.split("/")[1];
    if (first && LANG_CODES.has(first)) {
      if (first !== lang) {
        setLangState(first);
        localStorage.setItem(STORAGE_KEY, first);
      }
    } else if (lang !== "eng") {
      // On English pages, only reset if we navigated away from a lang URL
      // (don't reset if user manually set lang via selector)
      const urlHadLang = getLangFromUrl();
      if (urlHadLang === null && pathname === "/" || !pathname.startsWith(`/${lang}`)) {
        setLangState("eng");
        localStorage.setItem(STORAGE_KEY, "eng");
      }
    }
  }, [pathname]);

  const setLang = (code: string) => {
    setLangState(code);
    localStorage.setItem(STORAGE_KEY, code);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
