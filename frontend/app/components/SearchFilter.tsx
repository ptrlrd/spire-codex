"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

interface FilterOption {
  label: string;
  value: string;
  group?: string;
}

interface SortOption {
  label: string;
  value: string;
}

function groupOptions(options: FilterOption[]): { group?: string; opts: FilterOption[] }[] {
  const segments: { group?: string; opts: FilterOption[] }[] = [];
  for (const opt of options) {
    const last = segments[segments.length - 1];
    if (last && last.group === opt.group) last.opts.push(opt);
    else segments.push({ group: opt.group, opts: [opt] });
  }
  return segments;
}

interface SearchFilterProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters?: {
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
    // When true, omit the empty "{label}" placeholder option — for selects
    // that are always set to one of their options (e.g. a view switcher).
    noEmptyOption?: boolean;
  }[];
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (value: string) => void;
  resultCount?: number;
  placeholder?: string;
  extra?: React.ReactNode;
}

export default function SearchFilter({
  search,
  onSearchChange,
  filters,
  sortOptions,
  sortValue,
  onSortChange,
  resultCount,
  placeholder = "Search...",
  extra,
}: SearchFilterProps) {
  const { lang } = useLanguage();

  // Decouple input value from upstream `search` state so each keystroke
  // doesn't re-trigger the parent's URL update + API fetch (which caused
  // the typing flicker on /cards, /relics, /potions, etc., issue #274).
  // Local `draft` advances immediately; `onSearchChange` fires 200ms after
  // typing stabilizes. External `search` prop changes (e.g. URL → state
  // sync on mount, or a clear-filter button) flow back into the draft.
  const [draft, setDraft] = useState(search);
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  });
  useEffect(() => {
    setDraft(search);
  }, [search]);
  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => onSearchChangeRef.current(draft), 200);
    return () => clearTimeout(timer);
  }, [draft, search]);

  return (
    <div className="flex flex-wrap gap-2 items-center mb-6">
      <div className="relative flex-1 min-w-[140px]">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-gold)]/50 transition-colors text-sm"
        />
      </div>
      {filters?.map((filter) => (
        <select
          key={filter.label}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 cursor-pointer text-sm"
        >
          {!filter.noEmptyOption && <option value="">{filter.label}</option>}
          {groupOptions(filter.options).map((seg, i) =>
            seg.group ? (
              <optgroup key={`${seg.group}-${i}`} label={seg.group}>
                {seg.opts.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              seg.opts.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            ),
          )}
        </select>
      ))}
      {sortOptions && onSortChange && (
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 cursor-pointer text-sm"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {resultCount !== undefined && (
        <span className="text-sm text-[var(--text-muted)] whitespace-nowrap">
          {resultCount} {t("results", lang)}
        </span>
      )}
      {extra && (
        <div className="flex items-center gap-2 ml-auto">
          {extra}
        </div>
      )}
    </div>
  );
}
