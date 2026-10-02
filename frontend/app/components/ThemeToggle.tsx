"use client";

import { useAuth } from "@/app/contexts/AuthContext";
import { useT } from "@/lib/i18n";
import { CDN_BASE } from "@/lib/image-url";
import { forgetFlair } from "@/lib/supporter-flair";
import {
  VIEWER_CUSTOM_CSS_KEY,
  VIEWER_CUSTOM_KEY,
  applyPalette,
  normalizeTheme,
  paletteCss,
  paletteFor,
} from "@/lib/theme-palette";
import { useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const CHARACTER_THEMES = [
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
] as const;
export type CharacterTheme = (typeof CHARACTER_THEMES)[number];
type Mode = "light" | "dark" | "character" | "custom";

const CHARACTER_NAMES: Record<CharacterTheme, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  defect: "Defect",
  necrobinder: "Necrobinder",
  regent: "Regent",
};
const DEFAULT_CUSTOM = "#e8b830";

function isCharacter(value: string | null): value is CharacterTheme {
  return (CHARACTER_THEMES as readonly string[]).includes(value ?? "");
}

function readCurrent(): {
  mode: Mode;
  character: CharacterTheme;
  custom: string;
} {
  const attr = document.documentElement.getAttribute("data-theme");
  let character: CharacterTheme = "ironclad";
  let custom = DEFAULT_CUSTOM;
  try {
    const remembered = localStorage.getItem("theme-character");
    if (isCharacter(remembered)) character = remembered;
    const hex = normalizeTheme(localStorage.getItem(VIEWER_CUSTOM_KEY));
    if (hex && hex.startsWith("#")) custom = hex;
  } catch {
    /* storage unavailable */
  }
  if (isCharacter(attr)) return { mode: "character", character, custom };
  if (attr === "custom") return { mode: "custom", character, custom };
  return { mode: attr === "light" ? "light" : "dark", character, custom };
}

function applyTheme(value: "light" | "dark" | "custom" | CharacterTheme) {
  document.documentElement.setAttribute("data-theme", value);
  document.documentElement.classList.toggle("dark", value !== "light");
  try {
    localStorage.setItem("theme", value);
    if (isCharacter(value)) localStorage.setItem("theme-character", value);
  } catch {
    /* private mode / storage disabled */
  }
}

function applyCustom(hex: string) {
  const palette = paletteFor(hex, "dark");
  if (!palette) return;
  applyPalette(palette);
  applyTheme("custom");
  try {
    localStorage.setItem(VIEWER_CUSTOM_KEY, hex);
    localStorage.setItem(VIEWER_CUSTOM_CSS_KEY, paletteCss(palette));
  } catch {
    /* storage unavailable */
  }
}

function clearCustom() {
  applyPalette(null);
}

const sun = (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const moon = (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden
  >
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </svg>
);
const swords = (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
    <path d="M9.5 6.5 21 18" />
  </svg>
);
const drop = (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 2.7 6.3 9.6a7 7 0 1 0 11.4 0z" />
  </svg>
);

function characterIcon(key: CharacterTheme) {
  return `${CDN_BASE}/ui/characters/character_icon_${key}.webp`;
}

/** Light / Dark / Character / Custom theme picker. Flips `data-theme` on
 * <html> and the Tailwind `dark` class, persists the choice, and the inline
 * script in the root layout applies it before first paint. Character
 * palettes live in globals.css; a custom colour derives its palette at
 * runtime (lib/theme-palette.ts) and is saved to the account for
 * supporters so other people see it on their pages.
 *
 * variants: "icon" = compact nav-cluster button opening a popover
 * (desktop); "segmented" = a "Theme" row for the mobile drawer. */
export default function ThemeToggle({
  variant = "icon",
}: {
  variant?: "icon" | "segmented";
}) {
  const t = useT();
  const { user } = useAuth();
  const supporter = Boolean(user?.supporter?.active);
  const [mode, setMode] = useState<Mode>("dark");
  const [character, setCharacter] = useState<CharacterTheme>("ironclad");
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const current = readCurrent();
    setMode(current.mode);
    setCharacter(current.character);
    setCustom(current.custom);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = (theme: string, delay = 0) => {
    if (!supporter) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/auth/theme`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      })
        .then(() => forgetFlair(user?.username))
        .catch(() => undefined);
    }, delay);
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === "custom") {
      applyCustom(custom);
      save(custom);
      return;
    }
    clearCustom();
    applyTheme(next === "character" ? character : next);
    if (next === "character") save(character);
  };
  const chooseCharacter = (next: CharacterTheme) => {
    setCharacter(next);
    setMode("character");
    clearCustom();
    applyTheme(next);
    save(next);
  };
  const chooseCustom = (hex: string) => {
    const value = normalizeTheme(hex);
    if (!value || !value.startsWith("#")) return;
    setCustom(value);
    setMode("custom");
    applyCustom(value);
    save(value, 400);
  };

  const segment = (
    value: Mode,
    label: string,
    icon: React.ReactNode,
    compact: boolean,
  ) => (
    <button
      key={value}
      type="button"
      onClick={() => chooseMode(value)}
      aria-pressed={mode === value}
      className={`flex items-center gap-1.5 rounded-md ${compact ? "px-2.5 py-1.5" : "px-3 py-1.5"} text-sm font-medium transition-colors ${
        mode === value
          ? "bg-[var(--accent-gold)] text-on-accent"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const characterRow = (
    <div
      role="radiogroup"
      aria-label={t("Pick a character")}
      className="flex items-center gap-1.5"
    >
      {CHARACTER_THEMES.map((key) => {
        const active = mode === "character" && character === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            title={CHARACTER_NAMES[key]}
            aria-label={CHARACTER_NAMES[key]}
            onClick={() => chooseCharacter(key)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              active
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15"
                : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-accent)]"
            }`}
          >
            <img
              src={characterIcon(key)}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
              loading="lazy"
            />
          </button>
        );
      })}
    </div>
  );

  const customRow = (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={custom}
        onChange={(e) => chooseCustom(e.target.value)}
        aria-label={t("Pick a colour")}
        className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1"
      />
      <span className="font-mono text-xs text-[var(--text-secondary)]">
        {custom}
      </span>
    </div>
  );

  const segments = (compact: boolean) => (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1">
      {segment("light", t("Light"), sun, compact)}
      {segment("dark", t("Dark"), moon, compact)}
      {segment("character", t("Character"), swords, compact)}
      {supporter && segment("custom", t("Custom"), drop, compact)}
    </div>
  );

  if (variant === "segmented") {
    return (
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg font-semibold text-[var(--text-primary)]">
            {t("Theme")}
          </span>
          {segments(true)}
        </div>
        {mode === "character" && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              {CHARACTER_NAMES[character]}
            </span>
            {characterRow}
          </div>
        )}
        {mode === "custom" && supporter && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              {t("Your colour")}
            </span>
            {customRow}
          </div>
        )}
      </div>
    );
  }

  const triggerIcon =
    mode === "character" ? (
      <img
        src={characterIcon(character)}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 object-contain"
      />
    ) : mode === "custom" ? (
      <span
        className="h-4 w-4 rounded-full border border-[var(--border-accent)]"
        style={{ backgroundColor: custom }}
        aria-hidden
      />
    ) : mode === "light" ? (
      sun
    ) : (
      moon
    );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("Theme")}
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
      >
        {triggerIcon}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("Theme")}
          className="absolute right-0 top-11 z-50 w-max min-w-[16rem] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 shadow-2xl shadow-scrim/50"
        >
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t("Theme")}
          </div>
          {segments(false)}
          {mode === "character" && (
            <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
              <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="uppercase tracking-wider">
                  {t("Pick a character")}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {CHARACTER_NAMES[character]}
                </span>
              </div>
              {characterRow}
            </div>
          )}
          {mode === "custom" && supporter && (
            <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {t("Pick a colour")}
              </div>
              {customRow}
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {t(
                  "Thanks for supporting the site. Your colour shows on your profile and runs when you turn that on in your profile settings.",
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
