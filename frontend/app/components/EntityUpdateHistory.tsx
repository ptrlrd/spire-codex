"use client";

import { useT } from "@/lib/i18n";
import { useState, useEffect, useMemo } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import {
  HISTORY_COLLAPSED_COUNT,
  parseChangeLine,
  visibleChanges,
  type HistoryChange,
} from "@/lib/history-format";
import EntityHistory from "./EntityHistory";
import HistoryChangeRow, { HistoryToggle } from "./HistoryChangeRow";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface UpdateEntry {
  version: string | null;
  type: string | null;
  date: string | null;
  changes: string[];
}

// Beta patches land green, main-branch releases gold, pre-release gray —
// same hue language as the channel pill and the changelog page.
function patchKind(type: string | null): "beta" | "main" | "pre" {
  if (!type || type === "Pre-release") return "pre";
  if (type.startsWith("Beta")) return "beta";
  return "main";
}

const kindText: Record<string, string> = {
  beta: "text-success",
  main: "text-[var(--accent-gold)]",
  pre: "text-[var(--text-muted)]",
};

const kindDot: Record<string, string> = {
  beta: "bg-success-fill",
  main: "bg-[var(--accent-gold)]",
  pre: "bg-line-strong",
};

/**
 * The "Version history" section on entity pages: the entity's own game-patch
 * changes (data/entity_history.json), replacing the site-changelog diffs
 * that used to masquerade as its history. Entities with nothing recorded
 * fall back to the changelog timeline.
 */
export default function EntityUpdateHistory({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const t = useT();
  const [entries, setEntries] = useState<UpdateEntry[] | null | "none">(null);
  const [expanded, setExpanded] = useState(false);
  const shown = useMemo(() => {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => {
        const prose: string[] = [];
        const parsed: HistoryChange[] = [];
        for (const line of entry.changes) {
          const change = parseChangeLine(line);
          if (change) parsed.push(change);
          else prose.push(line);
        }
        return { ...entry, prose, parsed: visibleChanges(parsed) };
      })
      .filter((entry) => entry.prose.length + entry.parsed.length > 0);
  }, [entries]);

  useEffect(() => {
    cachedFetch<UpdateEntry[]>(
      `${API}/api/update-history/${entityType}/${entityId}`,
    )
      .then((d) => setEntries(d.length > 0 ? d : "none"))
      .catch(() => setEntries("none"));
  }, [entityType, entityId]);

  if (entries === "none" || (entries !== null && shown.length === 0)) {
    return <EntityHistory entityType={entityType} entityId={entityId} />;
  }

  return (
    <section id="history">
      <h2>{t("Version history")}</h2>
      {entries === null ? (
        <p className="text-xs text-[var(--text-muted)] m-0">{t("Loading…")}</p>
      ) : (
        <div className="relative ml-2">
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[var(--border-subtle)]" />
          <div className="space-y-4">
            {shown.map((entry, i) => {
              const kind = patchKind(entry.type);
              return (
                <div
                  key={`${entry.version}-${i}`}
                  className={`relative pl-6 ${
                    !expanded && i >= HISTORY_COLLAPSED_COUNT ? "hidden" : ""
                  }`}
                >
                  <div
                    className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-[var(--bg-primary)] ${kindDot[kind]}`}
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {entry.version ?? t("Unknown")}
                    </span>
                    {entry.type && (
                      <span className={kindText[kind]}>{entry.type}</span>
                    )}
                    {entry.date && (
                      <span className="text-[var(--text-muted)]">
                        {entry.date}
                      </span>
                    )}
                  </div>
                  <ul className="mt-1.5 space-y-1 list-none m-0 p-0">
                    {entry.prose.map((line, j) => (
                      <li
                        key={`p${j}`}
                        className="text-xs text-[var(--text-muted)]"
                      >
                        {line}
                      </li>
                    ))}
                    {entry.parsed.map((change, j) => (
                      <li key={`c${j}`}>
                        <HistoryChangeRow change={change} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {shown.length > HISTORY_COLLAPSED_COUNT && (
            <HistoryToggle
              total={shown.length}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
            />
          )}
        </div>
      )}
    </section>
  );
}
