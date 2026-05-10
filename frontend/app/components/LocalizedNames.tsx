"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { LANG_HREFLANG, type LangCode } from "@/lib/languages";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Maps the human-readable language names returned by /api/names to the
// 3-letter URL slugs we use under /<lang>/. Hand-mapped because the
// API uses native names (Deutsch, 日本語, Português (BR)) and a string
// match against LANG_NAMES can drift on diacritics.
const API_NAME_TO_LANG: Record<string, LangCode> = {
  Deutsch: "deu",
  "Español (ES)": "esp",
  Français: "fra",
  Italiano: "ita",
  日本語: "jpn",
  한국어: "kor",
  Polski: "pol",
  "Português (BR)": "ptb",
  Русский: "rus",
  "Español (LA)": "spa",
  ไทย: "tha",
  Türkçe: "tur",
  简体中文: "zhs",
};

// URL segment per entity type. The API entityType matches the route
// segment in every case today, so a passthrough plus an explicit
// allow-list keeps things robust if the two ever diverge.
const ENTITY_ROUTE: Record<string, string> = {
  cards: "cards",
  characters: "characters",
  encounters: "encounters",
  enchantments: "enchantments",
  events: "events",
  monsters: "monsters",
  potions: "potions",
  powers: "powers",
  relics: "relics",
};

interface LocalizedNamesProps {
  entityType: string;
  entityId: string;
}

export default function LocalizedNames({
  entityType,
  entityId,
}: LocalizedNamesProps) {
  const { lang } = useLanguage();
  const [names, setNames] = useState<Record<string, string> | null>(null);

  // Fetch once on mount. We render the links in the DOM up-front (inside
  // a collapsed <details>) because Googlebot needs a crawl path between
  // the localized variants — without DOM-resident links here, Sozu's
  // /ptb/, /deu/, /jpn/, etc. variants stay orphaned and end up in
  // GSC's "Crawled - currently not indexed" bucket.
  useEffect(() => {
    cachedFetch<Record<string, string>>(
      `${API}/api/names/${entityType}/${entityId}`
    ).then(setNames);
  }, [entityType, entityId]);

  const route = ENTITY_ROUTE[entityType] ?? entityType;
  const idSlug = entityId.toLowerCase();

  // Build link entries up-front so the markup is the same whether the
  // names fetch has resolved or not (we render placeholder rows that
  // the crawler can still parse).
  const rows = names
    ? Object.entries(names)
        // Skip the row matching the user's current language — they're
        // already on it. English has no prefix; non-English use the
        // 3-letter slug.
        .filter(([apiName]) => {
          const code = API_NAME_TO_LANG[apiName];
          if (apiName === "English") return lang !== "eng";
          return code !== lang;
        })
        .map(([apiName, name]) => {
          const code = API_NAME_TO_LANG[apiName];
          const isEnglish = apiName === "English";
          const href = isEnglish
            ? `/${route}/${idSlug}`
            : code
              ? `/${code}/${route}/${idSlug}`
              : null;
          const hrefLang = isEnglish ? "en" : code ? LANG_HREFLANG[code] : undefined;
          return { apiName, name, href, hrefLang };
        })
    : [];

  return (
    <details className="mt-4 group">
      <summary
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1 cursor-pointer list-none"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 transition-transform -rotate-90 group-open:rotate-0"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
            clipRule="evenodd"
          />
        </svg>
        {t("Other languages", lang)}
      </summary>
      {rows.length > 0 ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs list-none p-0">
          {rows.map(({ apiName, name, href, hrefLang }) => (
            <li key={apiName} className="contents">
              {href ? (
                <Link
                  href={href}
                  hrefLang={hrefLang}
                  className="flex justify-between gap-2 hover:bg-[var(--bg-card)] rounded px-1 -mx-1 py-0.5 transition-colors"
                >
                  <span className="text-[var(--text-muted)]">{apiName}</span>
                  <span className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-right">
                    {name}
                  </span>
                </Link>
              ) : (
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--text-muted)]">{apiName}</span>
                  <span className="text-[var(--text-secondary)] text-right">
                    {name}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-muted)] mt-2">Loading...</p>
      )}
    </details>
  );
}
