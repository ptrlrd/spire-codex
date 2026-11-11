"use client";

import { useT } from "@/lib/i18n";
import {
  displayValue,
  fieldLabel,
  type HistoryChange,
} from "@/lib/history-format";
import { RichDescriptionSimple } from "./RichDescription";

function Side({ value, tone }: { value: string | null; tone: string }) {
  const t = useT();
  if (value === null) {
    return <span className="italic text-[var(--text-muted)]">{t("none")}</span>;
  }
  return (
    <span className={tone}>
      <RichDescriptionSimple text={value} />
    </span>
  );
}

export default function HistoryChangeRow({
  change,
}: {
  change: HistoryChange;
}) {
  const t = useT();
  const oldValue = displayValue(change.old);
  const newValue = displayValue(change.new);
  const long = (oldValue?.length ?? 0) + (newValue?.length ?? 0) > 80;
  if (long) {
    return (
      <div className="text-xs text-[var(--text-muted)]">
        <div className="text-[var(--text-secondary)] font-medium mb-1">
          {fieldLabel(change.field)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-danger/70 mb-0.5">
              {t("Before")}
            </div>
            <Side value={oldValue} tone="text-[var(--text-secondary)]" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-success/70 mb-0.5">
              {t("After")}
            </div>
            <Side value={newValue} tone="text-[var(--text-primary)]" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="text-xs text-[var(--text-muted)] flex items-baseline gap-1.5 flex-wrap">
      <span className="text-[var(--text-secondary)] font-medium">
        {fieldLabel(change.field)}
      </span>
      <Side value={oldValue} tone="text-danger/70 line-through" />
      <span aria-hidden>&rarr;</span>
      <Side value={newValue} tone="text-success/70" />
    </div>
  );
}

export function HistoryToggle({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-3 ml-8 rounded-md border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] transition-colors"
    >
      {expanded
        ? t("Show fewer versions")
        : `${t("Show all versions")} (${total})`}
    </button>
  );
}
