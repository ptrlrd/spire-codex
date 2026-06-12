"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/contexts/LanguageContext";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

/** "beta" when the current path sits in the beta section
 *  (/beta/... or /<lang>/beta/...), else "stable". */
export function useChannel(): "beta" | "stable" {
  const pathname = usePathname();
  const parts = pathname.split("/");
  if (parts[1] === "beta") return "beta";
  if (LANG_CODES.has(parts[1]) && parts[2] === "beta") return "beta";
  return "stable";
}

/**
 * Returns the prefix for building same-section URLs.
 * On /jpn/cards → "/jpn"; on /cards → "" (English, no prefix).
 * Inside the beta section the prefix keeps navigation there:
 * /beta/cards → "/beta"; /jpn/beta/cards → "/jpn/beta". That one rule makes
 * every `${lp}/...` link in shared components channel-correct for free.
 */
export function useLangPrefix(): string {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const parts = pathname.split("/");
  const beta = parts[1] === "beta" || (LANG_CODES.has(parts[1]) && parts[2] === "beta");
  const suffix = beta ? "/beta" : "";
  const pathLang = parts[1];
  if (LANG_CODES.has(pathLang)) return `/${pathLang}${suffix}`;
  if (lang !== "eng" && LANG_CODES.has(lang)) return `/${lang}${suffix}`;
  return suffix;
}
