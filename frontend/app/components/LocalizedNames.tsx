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

  // Fetch once on mount and render the links directly (no drawer) so the
  // crawl path between the localized variants is always in the DOM.
  // Googlebot needs it, without DOM-resident links here, an entity's
  // /ptb/, /deu/, /jpn/, etc. variants stay orphaned and end up in GSC's
  // "Crawled - currently not indexed" bucket.
  useEffect(() => {
    cachedFetch<Record<string, string>>(
      `${API}/api/names/${entityType}/${entityId}`
    ).then(setNames);
  }, [entityType, entityId]);

  const route = ENTITY_ROUTE[entityType] ?? entityType;
  const idSlug = entityId.toLowerCase();

  const rows = names
    ? Object.entries(names)
        // Skip the row matching the user's current language, they're
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

  // Once loaded, hide the whole box if there's nothing to link to (entity
  // exists only in the current language).
  if (names !== null && rows.length === 0) return null;

  return (
    <section id="other-languages">
      <h2>{t("Other languages", lang)}</h2>
      {rows.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm list-none p-0 m-0">
          {rows.map(({ apiName, name, href, hrefLang }) => (
            <li key={apiName}>
              {href ? (
                <Link
                  href={href}
                  hrefLang={hrefLang}
                  className="flex justify-between gap-3 rounded px-1.5 -mx-1.5 py-1 hover:bg-[var(--bg-card)] transition-colors"
                >
                  <span className="text-[var(--text-secondary)]">{apiName}</span>
                  <span className="text-[var(--text-primary)] text-right">
                    {name}
                  </span>
                </Link>
              ) : (
                <div className="flex justify-between gap-3 px-1.5 py-1">
                  <span className="text-[var(--text-secondary)]">{apiName}</span>
                  <span className="text-[var(--text-primary)] text-right">
                    {name}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-muted)] m-0">Loading…</p>
      )}
    </section>
  );
}
