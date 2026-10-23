"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

export interface PickerItem {
  id: string;
  name: string;
}

export function filterPickerItems<T extends PickerItem>(
  items: T[],
  query: string,
  max = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) contains.push(item);
    if (starts.length >= max) break;
  }
  return [...starts, ...contains].slice(0, max);
}

export default function EntityPicker<T extends PickerItem>({
  placeholder,
  items,
  onPick,
  disabled,
  label,
}: {
  placeholder: string;
  items: T[];
  onPick: (item: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(
    () => filterPickerItems(items, query),
    [query, items],
  );
  const expanded = open && matches.length > 0;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  function choose(item: T) {
    onPick(item);
    setQuery("");
    setOpen(false);
    setActive(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (matches.length ? (i + 1) % matches.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        matches.length ? (i - 1 + matches.length) % matches.length : 0,
      );
    } else if (e.key === "Enter") {
      if (expanded && matches[activeIndex]) {
        e.preventDefault();
        choose(matches[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-label={label ?? placeholder}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded ? `${listId}-${activeIndex}` : undefined
        }
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
      />
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("Suggestions")}
          className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg overflow-hidden"
        >
          {matches.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                i === activeIndex
                  ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
