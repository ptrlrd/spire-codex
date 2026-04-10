"use client";

import { useState, useRef, useEffect } from "react";
import { useBetaVersion } from "../contexts/BetaVersionContext";

export default function VersionSelector() {
  const { version, versions, setVersion } = useBetaVersion();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  if (versions.length === 0) return null;

  const latestVersion = versions.find((v) => v.is_latest);
  const displayLabel = version || latestVersion?.version || "Latest";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10 text-sm text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/20 transition-colors"
        aria-label="Select beta version"
      >
        <span className="text-xs font-medium">{displayLabel}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 w-44 max-h-60 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 z-50"
        >
          <div className="py-1">
            {versions.map((v) => {
              const isSelected = version
                ? v.version === version
                : v.is_latest;
              return (
                <button
                  key={v.version}
                  onClick={() => {
                    setVersion(v.is_latest ? null : v.version);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    isSelected
                      ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                  }`}
                >
                  <span className="font-medium">{v.version}</span>
                  {v.is_latest && (
                    <span className="text-xs text-[var(--text-muted)] ml-2">latest</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
