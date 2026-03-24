"use client";

import { useState, useEffect } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface LocalizedNamesProps {
  entityType: string;
  entityId: string;
}

export default function LocalizedNames({ entityType, entityId }: LocalizedNamesProps) {
  const { lang } = useLanguage();
  const [names, setNames] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || names) return;
    cachedFetch<Record<string, string>>(
      `${API}/api/names/${entityType}/${entityId}`
    ).then(setNames);
  }, [open, entityType, entityId, names]);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1"
      >
        <span className="text-sm">{open ? "▾" : "▸"}</span>
        {t("Other languages", lang)}
      </button>
      {open && names && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
          {Object.entries(names)
            .filter(([lang]) => lang !== "English")
            .map(([lang, name]) => (
              <div key={lang} className="flex justify-between gap-2">
                <span className="text-[var(--text-muted)]">{lang}</span>
                <span className="text-[var(--text-secondary)] text-right">{name}</span>
              </div>
            ))}
        </div>
      )}
      {open && !names && (
        <p className="text-xs text-[var(--text-muted)] mt-2">Loading...</p>
      )}
    </div>
  );
}
