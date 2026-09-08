"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Card } from "@/lib/api";
import FullCardGrid from "@/app/components/FullCardGrid";
import RichDescription from "@/app/components/RichDescription";
import SearchFilter from "@/app/components/SearchFilter";
import EntityProse from "@/app/components/EntityProse";
import { cachedFetch } from "@/lib/fetch-cache";
import "@/app/card-revamp.css";
import "@/app/reference-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Keyword {
  id: string;
  name: string;
  description: string;
}

interface GlossaryTerm {
  id: string;
  name: string;
  description: string;
  category: string;
}

const colorOptions = [
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
  { label: "Colorless", value: "colorless" },
];

const CATEGORY_LABELS: Record<string, string> = {
  combat: "Combat",
  mechanics: "Mechanics",
  zones: "Card Zones",
  progression: "Progression",
  rooms: "Map Rooms",
};

type InitialResult =
  | { type: "keyword"; data: Keyword }
  | { type: "glossary"; data: GlossaryTerm }
  | null;

export default function KeywordDetail({ initialResult }: { initialResult?: InitialResult } = {}) {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();

  const [keyword, setKeyword] = useState<Keyword | null>(initialResult?.type === "keyword" ? initialResult.data : null);
  const [glossary, setGlossary] = useState<GlossaryTerm | null>(initialResult?.type === "glossary" ? initialResult.data : null);
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [color, setColor] = useState("");
  const [loading, setLoading] = useState(!initialResult);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setGlossary(null);
    setCards([]);

    // Try keyword first, fall back to glossary
    cachedFetch<Keyword>(`${API}/api/keywords/${id}?lang=${lang}`)
      .then((kw) => {
        setKeyword(kw);
        return cachedFetch<Card[]>(`${API}/api/cards?keyword=${encodeURIComponent(id)}&lang=${lang}`);
      })
      .then((cardList) => setCards(cardList))
      .catch(() => {
        // Not a keyword, try glossary
        return cachedFetch<GlossaryTerm>(`${API}/api/glossary/${id}?lang=${lang}`)
          .then((term) => setGlossary(term))
          .catch(() => {
            if (!initialResult) setNotFound(true);
          });
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">{t("Loading...")}</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/keywords" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          &larr; {t("Back to")} {t("Keywords")}
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">{t("Term Not Found")}</h1>
        </div>
      </div>
    );
  }

  // Glossary term page
  if (glossary) {
    return (
      <div className="card-rvmp">
        <div className="cd-top">
          <button onClick={() => router.back()} className="cd-back">
            &larr; {t("Back to")} {t("Keywords & Game Terms")}
          </button>
        </div>

        <div className="wrap solo narrow">
          <main className="main">
            <div className="hero">
              <p className="eyebrow">
                <span className="dot">&#9670;</span>
                <span>{t(CATEGORY_LABELS[glossary.category] || "Game Term")}</span>
              </p>
              <h1>{glossary.name}</h1>
            </div>

            <section id="description">
              <h2>{t("Description")}</h2>
              <div className="desc-quote">
                <RichDescription text={glossary.description.replace(/\n/g, "\n\n")} />
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  // Keyword page (existing behavior)
  if (!keyword) return null;

  let filtered = cards;
  if (color) filtered = filtered.filter((c) => c.color === color);
  if (search) filtered = filtered.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="card-rvmp">
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to")} {t("Keywords")}
        </button>
      </div>

      <div className="wrap solo">
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Keyword")}</span>
            </p>
            <h1>{keyword.name}</h1>
            <div className="lede">
              <RichDescription text={keyword.description} />
            </div>
            <EntityProse kind="keyword" keyword={keyword} lead />
          </div>

          <section id="cards">
            <h2>{t("Cards")}</h2>
            <p className="h-note">
              {t("{n} cards with this keyword", { n: cards.length })}
            </p>

            <SearchFilter
              search={search}
              onSearchChange={setSearch}
              placeholder={t("Search {name} cards...", { name: keyword.name })}
              resultCount={filtered.length}
              filters={[
                {
                  label: "Any Character",
                  name: "Character",
                  value: color,
                  options: colorOptions,
                  onChange: setColor,
                },
              ]}
            />

            <FullCardGrid cards={filtered} />
          </section>
        </main>
      </div>
    </div>
  );
}
