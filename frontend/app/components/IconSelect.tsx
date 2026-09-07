"use client";

import { useEffect, useId, useRef, useState } from "react";
import { imageUrl } from "@/lib/image-url";

export interface IconOption {
  label: string;
  value: string;
  group?: string;
  icon?: string;
}

interface IconSelectProps {
  label: string;
  value: string;
  options: IconOption[];
  onChange: (value: string) => void;
}

/**
 * Drop-in replacement for the native filter <select> when options carry
 * image icons (native <option> elements are text-only, so the game's energy
 * and star icons can't render inside one). Mirrors the filter-select look;
 * group headers and rows show the real game asset.
 */
export default function IconSelect({ label, value, options, onChange }: IconSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Flat list with the placeholder first, mirroring the native select's
  // empty option; `active` indexes into this.
  const flat: IconOption[] = [{ label, value: "" }, ...options];
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault();
      setOpen(true);
      setActive(Math.max(0, flat.findIndex((o) => o.value === value)));
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => Math.min(flat.length - 1, Math.max(0, a + delta)));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (active >= 0) pick(flat[active].value);
    }
  };

  let lastGroup: string | undefined;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        className="filter-select inline-flex items-center gap-1.5 px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 cursor-pointer text-sm"
      >
        {selected?.icon && (
          <img src={imageUrl(selected.icon)} alt="" className="w-4 h-4" crossOrigin="anonymous" />
        )}
        <span>{selected ? selected.label : label}</span>
        <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full mt-1 min-w-full w-max rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-scrim/30 z-50 py-1"
        >
          {flat.map((opt, i) => {
            const header =
              opt.group && opt.group !== lastGroup ? (
                <div
                  key={`g-${opt.group}`}
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5"
                >
                  {opt.icon && (
                    <img src={imageUrl(opt.icon)} alt="" className="w-3.5 h-3.5" crossOrigin="anonymous" />
                  )}
                  {opt.group}
                </div>
              ) : null;
            lastGroup = opt.group;
            const isSelected = opt.value === value;
            return (
              <div key={opt.value || "any"}>
                {header}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(opt.value)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer ${
                    i === active ? "bg-[var(--bg-card)]" : ""
                  } ${isSelected ? "text-[var(--accent-gold)]" : "text-[var(--text-primary)]"}`}
                >
                  {opt.icon && (
                    <img src={imageUrl(opt.icon)} alt="" className="w-4 h-4" crossOrigin="anonymous" />
                  )}
                  {opt.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
