"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { useGameLocale, useT } from "@/lib/i18n";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { LANG_NAMES } from "@/lib/languages";

const CODE_TO_SHORT: Record<string, string> = {
  deu: "DE",
  eng: "EN",
  esp: "ES",
  fra: "FR",
  ita: "IT",
  jpn: "JP",
  kor: "KR",
  pol: "PL",
  ptb: "PT",
  rus: "RU",
  spa: "LA",
  tha: "TH",
  tur: "TR",
  zhs: "CN",
  zht: "TW",
};

const LANGUAGES: { code: Locale; name: string }[] = routing.locales
  .map((code) => ({ code, name: code === "eng" ? "English" : LANG_NAMES[code] }))
  .sort((a, b) => a.code.localeCompare(b.code));

export default function LanguageSelector() {
  const lang = useGameLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const nextRouter = useNextRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        open &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleLangChange(locale: Locale) {
    setOpen(false);
    const query = searchParams.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    // English lives at the bare path; next-intl would prefix it with /eng and
    // rely on a redirect, so go straight to the canonical URL instead.
    if (locale === routing.defaultLocale) nextRouter.replace(href);
    else router.replace(href, { locale });
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        // Mobile (< sm): icon-only square so it doesn't crowd the right
        // cluster next to the burger. sm+: shows the 2-letter code
        // (EN / JP / DE) alongside the globe so the active language is
        // visible without opening the menu.
        className="inline-flex items-center gap-0 sm:gap-1.5 h-9 w-9 sm:w-auto sm:px-3 justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
        aria-label={t("Select language (current: {code})", { code: CODE_TO_SHORT[lang] || "EN" })}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
        <span className="hidden sm:inline text-xs font-medium">{CODE_TO_SHORT[lang] || "EN"}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 w-48 max-h-80 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 z-50"
        >
          <div className="py-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => handleLangChange(l.code)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  l.code === lang
                    ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                }`}
              >
                <span className="font-medium">{l.name}</span>
                <span className="text-xs text-[var(--text-muted)] ml-2">{CODE_TO_SHORT[l.code]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
