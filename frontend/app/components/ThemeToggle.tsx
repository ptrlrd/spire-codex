"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

/** Light/dark theme toggle for the redesign. Flips `data-theme` on <html> and
 * the Tailwind `dark` class, persists the choice, and (via the inline script in
 * the root layout) applies it before first paint so there's no flash. The
 * palette itself lives in globals.css under `:root[data-theme="light"]`.
 *
 * variants: "icon" = compact nav-cluster button (desktop); "segmented" =
 * a "Theme" row with a Light/Dark switch for the mobile drawer. */
export default function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "segmented" }) {
  const { lang } = useLanguage();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  const apply = (next: "dark" | "light") => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled */
    }
  };
  const toggle = () =>
    apply(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");

  const sun = (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
  const moon = (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );

  if (variant === "segmented") {
    const seg = (mode: "light" | "dark", label: string, icon: React.ReactNode) => (
      <button
        type="button"
        onClick={() => apply(mode)}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          theme === mode ? "bg-[var(--accent-gold)] text-[#1a1205]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        {icon}
        {label}
      </button>
    );
    return (
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-lg font-semibold text-[var(--text-primary)]">{t("Theme", lang)}</span>
        <div className="flex gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1">
          {seg("light", t("Light", lang), sun)}
          {seg("dark", t("Dark", lang), moon)}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("Toggle light and dark theme", lang)}
      className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
