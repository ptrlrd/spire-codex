"use client";

// Floating "Feedback" button pinned to the bottom-right on every page. It opens
// the existing feedback modal (which lives in the Footer and listens for the
// `#feedback` hash), so there's a single feedback form for the whole site.

import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

export default function FloatingFeedback() {
  const { lang } = useLanguage();

  const open = () => {
    if (window.location.hash === "#feedback") {
      // Already anchored (e.g. modal was open then closed without stripping) —
      // re-fire so the Footer's hashchange listener re-opens it.
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } else {
      window.location.hash = "feedback";
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      aria-label={t("Submit Feedback", lang)}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--border-accent)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] shadow-lg hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] transition-colors"
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="hidden sm:inline">{t("Feedback", lang)}</span>
    </button>
  );
}
