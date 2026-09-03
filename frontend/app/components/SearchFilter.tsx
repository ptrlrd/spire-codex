"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import IconSelect from "./IconSelect";

interface FilterOption {
  label: string;
  value: string;
  group?: string;
  // Game-asset icon URL. Options with icons render through IconSelect,
  // since native <option> elements can't contain images.
  icon?: string;
}

interface SortOption {
  label: string;
  value: string;
}

const selectClass =
  "filter-select px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 cursor-pointer text-sm";

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
    // Short caption rendered above the select so the filter stays identifiable
    // after a value is picked. Passed through t(); falls back to the raw text.
    name?: string;
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

  const caption = (text: string) => (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {t(text, lang)}
    </span>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-end mb-6">
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
          <label key={filter.label} className="flex flex-col gap-1">
            {filter.name && caption(filter.name)}
            {filter.options.some((o) => o.icon) ? (
              <IconSelect
                label={t(filter.label, lang)}
                value={filter.value}
                options={filter.options}
                onChange={filter.onChange}
              />
            ) : (
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              aria-label={t(filter.name ?? filter.label, lang)}
              className={selectClass}
            >
              {!filter.noEmptyOption && (
                <option className="filter-option" value="">
                  {t(filter.label, lang)}
                </option>
              )}
              {groupOptions(filter.options).map((seg, i) =>
                seg.group ? (
                  <optgroup key={`${seg.group}-${i}`} label={seg.group}>
                    {seg.opts.map((opt) => (
                      <option className="filter-option" key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  seg.opts.map((opt) => (
                    <option className="filter-option" key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                ),
              )}
            </select>
            )}
          </label>
        ))}
        {sortOptions && onSortChange && (
          <label className="flex flex-col gap-1">
            {caption("Sort by")}
            <select
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label={t("Sort by", lang)}
              className={selectClass}
            >
              {sortOptions.map((opt) => (
                <option className="filter-option" key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {resultCount !== undefined && (
          <span className="text-sm text-[var(--text-muted)] whitespace-nowrap shrink-0 ml-auto text-left w-16">
            {resultCount} {t("results", lang)}
          </span>
        )}
        {extra && (
          <div className="flex items-center gap-2 ml-auto">
            {extra}
          </div>
        )}
      </div>
      {draft !== "" && resultCount === 0 && <div className="text-center py-12 text-[var(--text-muted)]">
        {t("No results found for", lang)} &ldquo;{draft}&rdquo;
      </div>}
    </div>
  );
}
