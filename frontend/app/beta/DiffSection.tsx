"use client";

// One collapsible entity-type section of the beta diff, styled to match the
// changelog page's CategorySection: chevron header with summary pills, then
// color-coded Added / Removed / Changed groups. Unlike the changelog, every
// entry links to its entity page (added/changed to the beta instance,
// removed to the main one).

import { useState } from "react";
import Link from "next/link";

export interface DiffEntry {
  id: string;
  name: string;
  href: string | null;
  note?: string | null;
}

export function SummaryBadge({
  added,
  removed,
  changed,
}: {
  added: number;
  removed: number;
  changed: number;
}) {
  return (
    <div className="flex gap-2 text-xs">
      {added > 0 && (
        <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-900/30">
          +{added} added
        </span>
      )}
      {removed > 0 && (
        <span className="px-2 py-0.5 rounded bg-red-950/50 text-red-400 border border-red-900/30">
          -{removed} removed
        </span>
      )}
      {changed > 0 && (
        <span className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-900/30">
          ~{changed} changed
        </span>
      )}
    </div>
  );
}

function EntryLink({ entry, className }: { entry: DiffEntry; className: string }) {
  if (!entry.href) return <span className={className}>{entry.name}</span>;
  return (
    <Link href={entry.href} className={`${className} hover:underline`}>
      {entry.name}
    </Link>
  );
}

export default function DiffSection({
  label,
  added,
  changed,
  removed,
}: {
  label: string;
  added: DiffEntry[];
  changed: DiffEntry[];
  removed: DiffEntry[];
}) {
  const [open, setOpen] = useState(false);
  const total = added.length + changed.length + removed.length;

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block transition-transform text-[var(--text-muted)] text-xs ${open ? "rotate-90" : ""}`}
          >
            &gt;
          </span>
          <span className="font-semibold text-[var(--text-primary)]">{label}</span>
          <span className="text-xs text-[var(--text-muted)]">
            {total} {total === 1 ? "change" : "changes"}
          </span>
        </div>
        <SummaryBadge added={added.length} removed={removed.length} changed={changed.length} />
      </div>

      {open && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3 space-y-3">
          {added.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">
                Added ({added.length})
              </h4>
              <ul className="space-y-1">
                {added.map((e) => (
                  <li key={e.id} className="text-sm">
                    <EntryLink entry={e} className="font-medium text-emerald-300" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {removed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1.5">
                Removed ({removed.length})
              </h4>
              <ul className="space-y-1">
                {removed.map((e) => (
                  <li key={e.id} className="text-sm">
                    <EntryLink entry={e} className="text-red-300 line-through" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {changed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                Changed ({changed.length})
              </h4>
              <ul className="space-y-1.5">
                {changed.map((e) => (
                  <li key={e.id} className="text-sm">
                    <EntryLink entry={e} className="font-medium text-[var(--text-secondary)]" />
                    {e.note && (
                      <span className="text-[11px] text-[var(--text-muted)] ml-2">{e.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
