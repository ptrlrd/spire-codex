"use client";

import { useState, useEffect } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import EntityHistory from "./EntityHistory";

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
  beta: "text-emerald-400",
  main: "text-[var(--accent-gold)]",
  pre: "text-[var(--text-muted)]",
};

const kindDot: Record<string, string> = {
  beta: "bg-emerald-500",
  main: "bg-[var(--accent-gold)]",
  pre: "bg-gray-500",
};

/**
 * The "Version history" section on card pages: real game-patch changes for
 * this card (scraped from the STS2 wiki, CC BY-SA 4.0), replacing the
 * site-changelog diffs that used to masquerade as the card's history.
 * Cards the wiki hasn't documented yet fall back to the changelog timeline.
 */
export default function CardUpdateHistory({ cardId }: { cardId: string }) {
  const { lang } = useLanguage();
  const [entries, setEntries] = useState<UpdateEntry[] | null | "none">(null);

  useEffect(() => {
    cachedFetch<UpdateEntry[]>(`${API}/api/cards/${cardId}/history`)
      .then((d) => setEntries(d.length > 0 ? d : "none"))
      .catch(() => setEntries("none"));
  }, [cardId]);

  if (entries === "none") {
    return <EntityHistory entityType="cards" entityId={cardId} />;
  }

  return (
    <section id="history">
      <h2>{t("Version history", lang)}</h2>
      {entries === null ? (
        <p className="text-xs text-[var(--text-muted)] m-0">Loading…</p>
      ) : (
        <>
          <div className="relative ml-2">
            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[var(--border-subtle)]" />
            <div className="space-y-4">
              {entries.map((entry, i) => {
                const kind = patchKind(entry.type);
                return (
                  <div key={`${entry.version}-${i}`} className="relative pl-6">
                    <div
                      className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-[var(--bg-primary)] ${kindDot[kind]}`}
                    />
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {entry.version ?? t("Unknown", lang)}
                      </span>
                      {entry.type && <span className={kindText[kind]}>{entry.type}</span>}
                      {entry.date && (
                        <span className="text-[var(--text-muted)]">{entry.date}</span>
                      )}
                    </div>
                    <ul className="mt-1.5 space-y-1 list-none m-0 p-0">
                      {entry.changes.map((change, j) => (
                        <li key={j} className="text-xs text-[var(--text-muted)]">
                          {change}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <a
            href="https://slaythespire.wiki.gg"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-xs text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
          >
            {t("Update history from the Slay the Spire 2 Wiki", lang)} (CC BY-SA 4.0)
          </a>
        </>
      )}
    </section>
  );
}
