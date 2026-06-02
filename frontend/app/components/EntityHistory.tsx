"use client";

import { useState, useEffect } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Change {
  field: string;
  old: string;
  new: string;
}

interface HistoryEntry {
  version: string;
  date: string;
  action: "added" | "removed" | "changed";
  changes: Change[];
}

interface EntityHistoryProps {
  entityType: string;
  entityId: string;
}

const actionColors: Record<string, string> = {
  added: "text-emerald-400",
  removed: "text-red-400",
  changed: "text-amber-400",
};

const actionLabels: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

const dotColors: Record<string, string> = {
  added: "bg-emerald-500",
  removed: "bg-red-500",
  changed: "bg-amber-500",
};

/**
 * Pre-deep-diff changelogs (v1.0.x) stored nested data as stringified
 * Python dict / list literals like `{'id': 'BASH', 'name': 'Bash'}`. Try
 * to parse those into real JSON so we can render them as readable lines
 * instead of one long unreadable blob. Returns the original string when
 * it doesn't look parsable.
 */
function tryParsePythonish(s: string): unknown {
  if (typeof s !== "string") return s;
  const trimmed = s.trim();
  if (!trimmed) return s;
  // Heuristic: look like a dict/list literal or a comma-joined sequence
  // of dict literals (multi-item list rendered as `{...}, {...}`).
  const dictish = /^[{\[]/.test(trimmed);
  const looksLikeMultiDict = /^\{.*\},\s*\{/.test(trimmed);
  if (!dictish && !looksLikeMultiDict) return s;
  // Wrap a comma-joined dict sequence in [] so it's a JSON array.
  const wrapped =
    looksLikeMultiDict && !trimmed.startsWith("[") ? `[${trimmed}]` : trimmed;
  // Convert single quotes -> double quotes, Python None/True/False -> json
  const json = wrapped
    .replace(/'/g, '"')
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false");
  try {
    return JSON.parse(json);
  } catch {
    return s;
  }
}

function ChangeValue({ raw, color }: { raw: string; color: string }) {
  if (raw === "none" || raw === "null" || !raw) {
    return <span className={color}>{raw || "—"}</span>;
  }
  const parsed = tryParsePythonish(raw);
  if (parsed === raw || typeof parsed === "string") {
    return <span className={color}>{raw}</span>;
  }
  // Render parsed structures as a compact, multi-line block, much easier
  // to scan than `{'id': 'X', 'name': 'Y', ...}` on one line.
  return (
    <pre
      className={`${color} text-[10px] leading-snug whitespace-pre-wrap font-mono break-words`}
    >
      {JSON.stringify(parsed, null, 2)}
    </pre>
  );
}

export default function EntityHistory({ entityType, entityId }: EntityHistoryProps) {
  const { lang } = useLanguage();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || history) return;
    cachedFetch<HistoryEntry[]>(
      `${API}/api/history/${entityType}/${entityId}`
    ).then(setHistory);
  }, [open, entityType, entityId, history]);

  return (
    <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1"
      >
        <span className="text-sm">{open ? "\u25BE" : "\u25B8"}</span>
        {t("Version History", lang)}
      </button>
      {open && history && history.length > 0 && (
        <div className="mt-3 relative ml-2">
          {/* Timeline line */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[var(--border-subtle)]" />

          <div className="space-y-4">
            {history.map((entry, i) => (
              <div key={`${entry.version}-${i}`} className="relative pl-6">
                {/* Timeline dot */}
                <div
                  className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-[var(--bg-primary)] ${dotColors[entry.action] || "bg-gray-500"}`}
                />

                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      v{entry.version}
                    </span>
                    <span className={actionColors[entry.action] || "text-gray-400"}>
                      {actionLabels[entry.action] || entry.action}
                    </span>
                    <span className="text-[var(--text-muted)]">{entry.date}</span>
                  </div>

                  {entry.changes.length > 0 && (
                    <div className="mt-1.5 space-y-2">
                      {entry.changes.map((change, j) => {
                        const oldStr = String(change.old ?? "");
                        const newStr = String(change.new ?? "");
                        const isComplex =
                          oldStr.length + newStr.length > 80 ||
                          oldStr.startsWith("{") ||
                          oldStr.startsWith("[") ||
                          newStr.startsWith("{") ||
                          newStr.startsWith("[");
                        if (isComplex) {
                          return (
                            <div
                              key={`${change.field}-${j}`}
                              className="text-xs text-[var(--text-muted)]"
                            >
                              <div className="text-[var(--text-secondary)] font-medium mb-1">
                                {change.field}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-3">
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-0.5">
                                    Before
                                  </div>
                                  <ChangeValue raw={oldStr} color="text-red-400/80" />
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-0.5">
                                    After
                                  </div>
                                  <ChangeValue raw={newStr} color="text-emerald-400/80" />
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`${change.field}-${j}`}
                            className="text-xs text-[var(--text-muted)] flex items-baseline gap-1.5 flex-wrap"
                          >
                            <span className="text-[var(--text-secondary)] font-medium">
                              {change.field}
                            </span>
                            <span className="text-red-400/70 line-through">
                              {oldStr}
                            </span>
                            <span className="text-[var(--text-muted)]">&rarr;</span>
                            <span className="text-emerald-400/70">{newStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {open && history && history.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] mt-2">
          No version history recorded for this entity.
        </p>
      )}
      {open && !history && (
        <p className="text-xs text-[var(--text-muted)] mt-2">Loading...</p>
      )}
    </div>
  );
}
