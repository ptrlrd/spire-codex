"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import HoverTooltip from "@/app/components/HoverTooltip";

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
  // null while loading so a card with no relations at all renders nothing
  // instead of a permanent "Loading" stub.
  const [groups, setGroups] = useState<RelatedGroup[] | null>(null);

  // Fetch on mount so the related-card <Link>s sit in the rendered DOM
  // without any interaction. This component is a critical internal-linking
  // hub for the localized card detail pages, which were stuck in GSC's
  // "Crawled - currently not indexed" bucket when they had no outbound
  // crawl paths.
  useEffect(() => {
    const fetches: Promise<RelatedGroup>[] = [];

    // Cards that create or reference this one (spawns_cards reverse lookup),
    // so token pages like Soul lead with their generators. Fetched first so
    // the group renders above the keyword/tag groups.
    fetches.push(
      cachedFetch<Card[]>(`${API}/api/cards?spawns=${encodeURIComponent(currentId.toUpperCase())}&lang=${lang}`).then(
        (cards) => ({
          label: "Created or used by",
          cards: cards.filter((c) => c.id !== currentId.toUpperCase()).slice(0, 12),
        })
      )
    );

    if (keywords?.length) {
      for (const kw of keywords) {
        fetches.push(
          cachedFetch<Card[]>(`${API}/api/cards?keyword=${encodeURIComponent(kw)}&lang=${lang}`).then(
            (cards) => ({
              label: `${kw} cards`,
              cards: cards.filter((c) => c.id !== currentId.toUpperCase()).slice(0, 8),
            })
          )
        );
      }
    }

    if (tags?.length) {
      for (const tag of tags) {
        fetches.push(
          cachedFetch<Card[]>(`${API}/api/cards?tag=${encodeURIComponent(tag)}&lang=${lang}`).then(
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
  }, [currentId, keywords, tags, color, lang]);

  // Render nothing until loaded (or if there's nothing related). Once loaded,
  // each group lists directly inside the card's Relations section as its own
  // block, matching the "Generates" block above it.
  if (!groups || groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="rel-block">
          <div className="rl">{group.label}</div>
          <ul className="space-y-1">
            {group.cards.map((card) => (
              <li key={card.id}>
                <HoverTooltip title={card.name} content={card.description} image={card.image_url}>
                  <Link
                    href={`${lp}/cards/${card.id.toLowerCase()}`}
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
                  >
                    {card.name}
                  </Link>
                </HoverTooltip>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
