"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Character, Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "@/app/contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHAR_NAMES: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  defect: "Defect",
  necrobinder: "Necrobinder",
  regent: "Regent",
};

const CHAR_COLORS: Record<string, string> = {
  ironclad: "Red",
  silent: "Green",
  defect: "Blue",
  necrobinder: "Purple",
  regent: "Orange",
};

const colorTextClass: Record<string, string> = {
  red: "text-[var(--color-ironclad)]",
  green: "text-[var(--color-silent)]",
  blue: "text-[var(--color-defect)]",
  purple: "text-[var(--color-necrobinder)]",
  orange: "text-[var(--color-regent)]",
};

const colorBgClass: Record<string, string> = {
  red: "bg-[var(--color-ironclad)]/20 border-[var(--color-ironclad)]/40",
  green: "bg-[var(--color-silent)]/20 border-[var(--color-silent)]/40",
  blue: "bg-[var(--color-defect)]/20 border-[var(--color-defect)]/40",
  purple: "bg-[var(--color-necrobinder)]/20 border-[var(--color-necrobinder)]/40",
  orange: "bg-[var(--color-regent)]/20 border-[var(--color-regent)]/40",
};

const KEYWORDS = ["Exhaust", "Ethereal", "Innate", "Retain", "Sly", "Eternal", "Unplayable"];

function parsePairSlug(slug: string): { a: string; b: string } | null {
  const match = slug.match(/^(\w+)-vs-(\w+)$/);
  if (!match) return null;
  return { a: match[1], b: match[2] };
}

function countByField(cards: Card[], field: "type" | "rarity"): Record<string, number> {
  const counts: Record<string, number> = {};
  // Use the _key variant (English) for consistent counting across languages
  const keyField = field === "type" ? "type_key" : "rarity_key";
  for (const card of cards) {
    const val = (card as unknown as Record<string, string>)[keyField] || card[field] || "Unknown";
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function countKeywords(cards: Card[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const kw of KEYWORDS) counts[kw] = 0;
  for (const card of cards) {
    // Use keywords_key (English) for consistent matching across languages
    const kws = card.keywords_key || card.keywords;
    if (kws) {
      for (const kw of kws) {
        if (kw in counts) counts[kw]++;
      }
    }
  }
  return counts;
}

function StatBox({
  label,
  valueA,
  valueB,
  colorA,
  colorB,
}: {
  label: string;
  valueA: number | string | null;
  valueB: number | string | null;
  colorA: string;
  colorB: string;
}) {
  return (
    <div className="bg-[var(--bg-primary)] rounded-lg p-3">
      <div className="text-xs text-[var(--text-muted)] mb-2 text-center font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div className="flex items-center justify-center gap-4">
        <span className={`text-xl font-bold ${colorTextClass[colorA] || "text-[var(--text-primary)]"}`}>
          {valueA ?? "-"}
        </span>
        <span className="text-xs text-[var(--text-muted)]">/</span>
        <span className={`text-xl font-bold ${colorTextClass[colorB] || "text-[var(--text-primary)]"}`}>
          {valueB ?? "-"}
        </span>
      </div>
    </div>
  );
}

function BarComparison({
  label,
  countA,
  countB,
  colorA,
  colorB,
  maxVal,
}: {
  label: string;
  countA: number;
  countB: number;
  colorA: string;
  colorB: string;
  maxVal: number;
}) {
  const pctA = maxVal > 0 ? (countA / maxVal) * 100 : 0;
  const pctB = maxVal > 0 ? (countB / maxVal) * 100 : 0;

  const barColorA: Record<string, string> = {
    red: "bg-red-500/70",
    green: "bg-green-500/70",
    blue: "bg-blue-500/70",
    purple: "bg-purple-500/70",
    orange: "bg-orange-500/70",
  };
  const barColorB: Record<string, string> = {
    red: "bg-red-500/70",
    green: "bg-green-500/70",
    blue: "bg-blue-500/70",
    purple: "bg-purple-500/70",
    orange: "bg-orange-500/70",
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${colorTextClass[colorA]}`}>{countA}</span>
        <span className="text-xs text-[var(--text-muted)] font-semibold">{label}</span>
        <span className={`text-xs font-medium ${colorTextClass[colorB]}`}>{countB}</span>
      </div>
      <div className="flex gap-1 h-2">
        <div className="flex-1 flex justify-end">
          <div
            className={`h-full rounded-l ${barColorA[colorA] || "bg-gray-500/70"} transition-all`}
            style={{ width: `${pctA}%` }}
          />
        </div>
        <div className="flex-1">
          <div
            className={`h-full rounded-r ${barColorB[colorB] || "bg-gray-500/70"} transition-all`}
            style={{ width: `${pctB}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface CompareDetailProps {
  pairSlug: string;
  initialCharA: Character | null;
  initialCharB: Character | null;
  initialCardsA: Card[];
  initialCardsB: Card[];
}

export default function CompareDetail({
  pairSlug,
  initialCharA,
  initialCharB,
  initialCardsA,
  initialCardsB,
}: CompareDetailProps) {
  const { lang } = useLanguage();
  const [charA, setCharA] = useState<Character | null>(initialCharA);
  const [charB, setCharB] = useState<Character | null>(initialCharB);
  const [cardsA, setCardsA] = useState<Card[]>(initialCardsA);
  const [cardsB, setCardsB] = useState<Card[]>(initialCardsB);
  const [loading, setLoading] = useState(false);
  const initialRender = useRef(true);

  const parsed = parsePairSlug(pairSlug);
  const idA = parsed?.a ?? "";
  const idB = parsed?.b ?? "";
  const colorA = (charA?.color || CHAR_COLORS[idA] || "").toLowerCase();
  const colorB = (charB?.color || CHAR_COLORS[idB] || "").toLowerCase();

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && initialCharA && initialCharB) return;
    }

    if (!parsed) return;

    Promise.all([
      cachedFetch<Character>(`${API}/api/characters/${parsed.a}?lang=${lang}`),
      cachedFetch<Character>(`${API}/api/characters/${parsed.b}?lang=${lang}`),
      cachedFetch<Card[]>(`${API}/api/cards?color=${parsed.a}&lang=${lang}`),
      cachedFetch<Card[]>(`${API}/api/cards?color=${parsed.b}&lang=${lang}`),
    ])
      .then(([cA, cB, crdsA, crdsB]) => {
        setCharA(cA);
        setCharB(cB);
        setCardsA(crdsA);
        setCardsB(crdsB);
      })
      .finally(() => setLoading(false));
  }, [lang]);

  if (!parsed) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-[var(--text-muted)]">Invalid comparison pair.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
    );
  }

  if (!charA || !charB) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-[var(--text-muted)]">
          Could not load character data. Please try again later.
        </p>
      </div>
    );
  }

  const nameA = charA.name;
  const nameB = charB.name;

  // Card pool breakdowns
  const typeCountsA = countByField(cardsA, "type");
  const typeCountsB = countByField(cardsB, "type");
  const rarityCountsA = countByField(cardsA, "rarity");
  const rarityCountsB = countByField(cardsB, "rarity");
  const keywordCountsA = countKeywords(cardsA);
  const keywordCountsB = countKeywords(cardsB);

  const allTypes = Array.from(
    new Set([...Object.keys(typeCountsA), ...Object.keys(typeCountsB)])
  ).sort();
  const allRarities = ["Common", "Uncommon", "Rare", "Basic"];
  const maxTypeCount = Math.max(
    ...allTypes.map((t) => Math.max(typeCountsA[t] || 0, typeCountsB[t] || 0)),
    1
  );
  const maxRarityCount = Math.max(
    ...allRarities.map((r) => Math.max(rarityCountsA[r] || 0, rarityCountsB[r] || 0)),
    1
  );
  const maxKeywordCount = Math.max(
    ...KEYWORDS.map((k) => Math.max(keywordCountsA[k] || 0, keywordCountsB[k] || 0)),
    1
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-2">
        <Link
          href="/compare"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors"
        >
          &larr; All Comparisons
        </Link>
      </div>
      <h1 className="text-3xl font-bold mb-2">
        <span className={colorTextClass[colorA]}>{nameA}</span>
        <span className="text-[var(--text-muted)] mx-3 text-xl">vs</span>
        <span className={colorTextClass[colorB]}>{nameB}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Side-by-side comparison of stats, card pools, and keyword distributions.
      </p>

      {/* Stats Comparison */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Base Stats
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="HP" valueA={charA.starting_hp} valueB={charB.starting_hp} colorA={colorA} colorB={colorB} />
          <StatBox label="Gold" valueA={charA.starting_gold} valueB={charB.starting_gold} colorA={colorA} colorB={colorB} />
          <StatBox label="Energy" valueA={charA.max_energy ?? 3} valueB={charB.max_energy ?? 3} colorA={colorA} colorB={colorB} />
          <StatBox label="Orb Slots" valueA={charA.orb_slots ?? 0} valueB={charB.orb_slots ?? 0} colorA={colorA} colorB={colorB} />
        </div>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${colorA === "red" ? "bg-red-400" : colorA === "green" ? "bg-green-400" : colorA === "blue" ? "bg-blue-400" : colorA === "purple" ? "bg-purple-400" : "bg-orange-400"}`} />
            {nameA}
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${colorB === "red" ? "bg-red-400" : colorB === "green" ? "bg-green-400" : colorB === "blue" ? "bg-blue-400" : colorB === "purple" ? "bg-purple-400" : "bg-orange-400"}`} />
            {nameB}
          </span>
        </div>
      </section>

      {/* Card Pool Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* By Type */}
        <section className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5`}>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Card Pool by Type
          </h2>
          <div className="flex items-center justify-between mb-3 text-xs text-[var(--text-muted)]">
            <span className={colorTextClass[colorA]}>{nameA} ({cardsA.length})</span>
            <span className={colorTextClass[colorB]}>{nameB} ({cardsB.length})</span>
          </div>
          {allTypes.map((type) => (
            <BarComparison
              key={type}
              label={type}
              countA={typeCountsA[type] || 0}
              countB={typeCountsB[type] || 0}
              colorA={colorA}
              colorB={colorB}
              maxVal={maxTypeCount}
            />
          ))}
        </section>

        {/* By Rarity */}
        <section className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5`}>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Card Pool by Rarity
          </h2>
          <div className="flex items-center justify-between mb-3 text-xs text-[var(--text-muted)]">
            <span className={colorTextClass[colorA]}>{nameA}</span>
            <span className={colorTextClass[colorB]}>{nameB}</span>
          </div>
          {allRarities
            .filter((r) => (rarityCountsA[r] || 0) + (rarityCountsB[r] || 0) > 0)
            .map((rarity) => (
              <BarComparison
                key={rarity}
                label={rarity}
                countA={rarityCountsA[rarity] || 0}
                countB={rarityCountsB[rarity] || 0}
                colorA={colorA}
                colorB={colorB}
                maxVal={maxRarityCount}
              />
            ))}
        </section>
      </div>

      {/* Keyword Distribution */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 mb-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Keyword Distribution
        </h2>
        <div className="flex items-center justify-between mb-3 text-xs text-[var(--text-muted)]">
          <span className={colorTextClass[colorA]}>{nameA}</span>
          <span className={colorTextClass[colorB]}>{nameB}</span>
        </div>
        {KEYWORDS.filter(
          (kw) => (keywordCountsA[kw] || 0) + (keywordCountsB[kw] || 0) > 0
        ).map((kw) => (
          <BarComparison
            key={kw}
            label={kw}
            countA={keywordCountsA[kw] || 0}
            countB={keywordCountsB[kw] || 0}
            colorA={colorA}
            colorB={colorB}
            maxVal={maxKeywordCount}
          />
        ))}
        {KEYWORDS.every(
          (kw) => (keywordCountsA[kw] || 0) + (keywordCountsB[kw] || 0) === 0
        ) && (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">
            No keyword cards found for either character.
          </p>
        )}
      </section>

      {/* Starting Deck Comparison */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Starting Decks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className={`rounded-xl border ${colorBgClass[colorA] || "border-[var(--border-subtle)]"} p-5`}
          >
            <h3 className={`text-sm font-semibold ${colorTextClass[colorA]} mb-3`}>
              {nameA} ({charA.starting_deck.length} cards)
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {charA.starting_deck.map((cardName, i) => (
                <span
                  key={`${cardName}-${i}`}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                >
                  {cardName.replace(/([A-Z])/g, " $1").trim()}
                </span>
              ))}
            </div>
          </div>
          <div
            className={`rounded-xl border ${colorBgClass[colorB] || "border-[var(--border-subtle)]"} p-5`}
          >
            <h3 className={`text-sm font-semibold ${colorTextClass[colorB]} mb-3`}>
              {nameB} ({charB.starting_deck.length} cards)
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {charB.starting_deck.map((cardName, i) => (
                <span
                  key={`${cardName}-${i}`}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                >
                  {cardName.replace(/([A-Z])/g, " $1").trim()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Starting Relics */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Starting Relics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className={`rounded-xl border ${colorBgClass[colorA] || "border-[var(--border-subtle)]"} p-5`}
          >
            <h3 className={`text-sm font-semibold ${colorTextClass[colorA]} mb-3`}>
              {nameA}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {charA.starting_relics.map((relicName) => (
                <span
                  key={relicName}
                  className="text-xs px-2 py-1 rounded bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20"
                >
                  {relicName.replace(/([A-Z])/g, " $1").trim()}
                </span>
              ))}
            </div>
          </div>
          <div
            className={`rounded-xl border ${colorBgClass[colorB] || "border-[var(--border-subtle)]"} p-5`}
          >
            <h3 className={`text-sm font-semibold ${colorTextClass[colorB]} mb-3`}>
              {nameB}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {charB.starting_relics.map((relicName) => (
                <span
                  key={relicName}
                  className="text-xs px-2 py-1 rounded bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20"
                >
                  {relicName.replace(/([A-Z])/g, " $1").trim()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
