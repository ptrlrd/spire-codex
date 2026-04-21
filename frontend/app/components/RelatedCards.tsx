"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RelatedCardsProps {
  currentId: string;
  keywords: string[] | null;
  tags: string[] | null;
  color: string;
}

interface RelatedGroup {
  label: string;
  cards: Card[];
}

export default function RelatedCards({ currentId, keywords, tags, color }: RelatedCardsProps) {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [groups, setGroups] = useState<RelatedGroup[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || groups.length > 0) return;

    const fetches: Promise<RelatedGroup>[] = [];

    // Fetch cards sharing each keyword
    if (keywords?.length) {
      for (const kw of keywords) {
        fetches.push(
          cachedFetch<Card[]>(`${API}/api/cards?keyword=${encodeURIComponent(kw)}`).then(
            (cards) => ({
              label: `${kw} cards`,
              cards: cards.filter((c) => c.id !== currentId.toUpperCase()).slice(0, 8),
            })
          )
        );
      }
    }

    // Fetch cards sharing each tag
    if (tags?.length) {
      for (const tag of tags) {
        fetches.push(
          cachedFetch<Card[]>(`${API}/api/cards?tag=${encodeURIComponent(tag)}`).then(
            (cards) => ({
              label: `${tag} cards`,
              cards: cards.filter((c) => c.id !== currentId.toUpperCase()).slice(0, 8),
            })
          )
        );
      }
    }

    Promise.all(fetches).then((results) =>
      setGroups(results.filter((g) => g.cards.length > 0))
    );
  }, [open, currentId, keywords, tags, color, groups.length]);

  if (!keywords?.length && !tags?.length) return null;

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
            clipRule="evenodd"
          />
        </svg>
        {t("Related Cards", lang)}
      </button>
      {open && groups.length > 0 && (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                {group.label}
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.cards.map((card) => (
                  <Link
                    key={card.id}
                    href={`${lp}/cards/${card.id.toLowerCase()}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors text-xs"
                  >
                    {card.image_url && (
                      <img
                        src={`${API}${card.image_url}`}
                        alt={card.name}
                        className="w-6 h-6 object-contain"
                        loading="lazy"
                        crossOrigin="anonymous"
                      />
                    )}
                    <span className="text-[var(--text-secondary)]">{card.name}</span>
                    <span className="text-[var(--text-muted)]">{card.cost}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && groups.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] mt-2">Loading...</p>
      )}
    </div>
  );
}
