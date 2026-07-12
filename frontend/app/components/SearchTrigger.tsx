"use client";

/**
 * Input-styled trigger that opens the GlobalSearch modal.
 *
 * GlobalSearch (rendered once in layout.tsx) listens for the "." keydown
 * event, dispatching that event is how we open it from anywhere.
 */

import { t } from "@/lib/ui-translations";
import { useLanguage } from "@/app/contexts/LanguageContext";

type Variant = "hero" | "nav" | "icon";

function openGlobalSearch() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: ".", bubbles: true }));
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

interface Props {
  variant: Variant;
  className?: string;
  placeholder?: string;
}

export default function SearchTrigger({ variant, className = "", placeholder }: Props) {
  const { lang } = useLanguage();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openGlobalSearch}
        aria-label={t("Search", lang)}
        className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors ${className}`}
      >
        <SearchIcon className="w-5 h-5" />
      </button>
    );
  }

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={openGlobalSearch}
        className={`sc-hero-search group w-full flex items-center gap-3 px-5 py-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-left hover:border-[var(--border-accent)] hover:bg-[var(--bg-card-hover)] transition-colors ${className}`}
      >
        <SearchIcon className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)] transition-colors shrink-0" />
        <span className="flex-1 text-base text-[var(--text-muted)] truncate">
          {placeholder ?? t("Find your next card, relic, or potion...", lang)}
        </span>
        <kbd className="hidden sm:inline-block text-xs text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 shrink-0">
          {t("Press .", lang)}
        </kbd>
      </button>
    );
  }

  // nav variant, mid-navbar, 40%-ish wide
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      className={`group w-full inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm hover:border-[var(--border-accent)] hover:bg-[var(--bg-card-hover)] transition-colors ${className}`}
    >
      <SearchIcon className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)] transition-colors shrink-0" />
      <span className="flex-1 text-left text-[var(--text-muted)] truncate">
        {placeholder ?? t("Search cards, relics, monsters...", lang)}
      </span>
      <kbd className="text-xs text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 shrink-0">
        .
      </kbd>
    </button>
  );
}
