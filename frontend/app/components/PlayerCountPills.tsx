"use client";

// Shared filter pills for the stats pages. `Pills` is the generic single-select
// pill row (same look as the charts page's local one). Player count comes in two
// vocabularies: pages that filter live use the `players` query param (1/2/3/4),
// snapshot-backed pages slice by the `bracket` param (solo/2p/3p/4p), where
// player count is one bracket dimension, mutually exclusive with the difficulty
// (a10 / win-rate) brackets.

export interface PillOption {
  value: string;
  label: string;
}

// `players` query param: "" = all runs, "1" = solo, ... "4" = 4+ players.
export const PLAYER_OPTS: PillOption[] = [
  { value: "", label: "All runs" },
  { value: "1", label: "Solo" },
  { value: "2", label: "2P" },
  { value: "3", label: "3P" },
  { value: "4", label: "4P" },
];

// `bracket` param on snapshot-backed pages (tier-list, metrics, community,
// encounter). "" = no player-count bracket.
export const PLAYER_BRACKET_OPTS: PillOption[] = [
  { value: "", label: "All" },
  { value: "solo", label: "Solo" },
  { value: "2p", label: "2P" },
  { value: "3p", label: "3P" },
  { value: "4p", label: "4P" },
];

export function Pills({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: PillOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || "all"}
            onClick={() => onChange(o.value)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
              active
                ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
