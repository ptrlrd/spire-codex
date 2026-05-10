"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RelatedItem {
  id: string;
  name: string;
  image_url?: string | null;
}

type RouteSegment =
  | "relics"
  | "potions"
  | "powers"
  | "monsters"
  | "events"
  | "encounters";

interface FetchGroup {
  /** Heading shown above the grid (already localized at call site). */
  label: string;
  /** API path appended to NEXT_PUBLIC_API_URL — must return RelatedItem[]. */
  path: string;
  /** Per-group cap. Defaults to 12. */
  limit?: number;
}

interface RelatedItemsProps {
  /** ID of the entity currently on screen — filtered out of every group. */
  currentId: string;
  /** Route segment under which siblings live (e.g. `relics`, `potions`). */
  route: RouteSegment;
  /** Heading on the collapsible block. */
  heading: string;
  /** API queries to fan out. The first non-empty group is rendered first. */
  groups: FetchGroup[];
}

/**
 * Renders a collapsible section of sibling-entity links — designed to
 * thicken thin detail pages and create internal crawl paths between
 * related items so Google can index the localized variants properly.
 *
 * Uses native `<details>` rather than React state so the links sit in
 * the DOM at first paint (Googlebot doesn't click toggles). Fetches
 * happen on mount, not on open, for the same reason.
 */
export default function RelatedItems({
  currentId,
  route,
  heading,
  groups,
}: RelatedItemsProps) {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [results, setResults] = useState<{ label: string; items: RelatedItem[] }[]>([]);

  // Stringify the groups' paths into a stable dependency key — the
  // groups array is rebuilt every render at the call site, so a direct
  // array dep would loop forever. The path string fully captures what
  // the effect actually consumes (which API URLs to hit).
  const groupsKey = groups.map((g) => `${g.label}|${g.path}|${g.limit ?? 12}`).join("\n");
  useEffect(() => {
    const upper = currentId.toUpperCase();
    Promise.all(
      groups.map(async ({ label, path, limit = 12 }) => {
        const items = await cachedFetch<RelatedItem[]>(`${API}${path}`).catch(() => []);
        return {
          label,
          items: items
            .filter((it) => it.id?.toUpperCase() !== upper)
            .slice(0, limit),
        };
      })
    ).then((all) => setResults(all.filter((g) => g.items.length > 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, route, groupsKey]);

  return (
    <details className="mt-6 group" open>
      <summary className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1 cursor-pointer list-none">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 transition-transform -rotate-90 group-open:rotate-0"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
            clipRule="evenodd"
          />
        </svg>
        {t(heading, lang)}
      </summary>
      {results.length > 0 ? (
        <div className="mt-3 space-y-4">
          {results.map((group) => (
            <div key={group.label}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                {group.label}
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`${lp}/${route}/${item.id.toLowerCase()}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors text-xs"
                  >
                    {item.image_url && (
                      <img
                        src={`${API}${item.image_url}`}
                        alt={item.name}
                        className="w-6 h-6 object-contain"
                        loading="lazy"
                        crossOrigin="anonymous"
                      />
                    )}
                    <span className="text-[var(--text-secondary)]">{item.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)] mt-2">Loading…</p>
      )}
    </details>
  );
}
