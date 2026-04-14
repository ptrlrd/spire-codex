"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Character, Relic, Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function toUpperSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function cleanDescription(desc: string): string {
  return desc.replace(/\{[^}]+\}/g, "X");
}

const colorStyles: Record<string, string> = {
  red: "border-red-700/60 from-red-900/20",
  green: "border-green-700/60 from-green-900/20",
  blue: "border-blue-700/60 from-blue-900/20",
  purple: "border-purple-700/60 from-purple-900/20",
  orange: "border-orange-700/60 from-orange-900/20",
};

export default function CharactersClient({ initialCharacters }: { initialCharacters: Character[] }) {
  const { lang } = useLanguage();
    const lp = useLangPrefix();
const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [relicMap, setRelicMap] = useState<Record<string, Relic>>({});
  const [cardMap, setCardMap] = useState<Record<string, Card>>({});
  const [loading, setLoading] = useState(false);
  const initialRender = useRef(true);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && initialCharacters.length > 0) {
        // Still need relics and cards for tooltips on initial render
        Promise.all([
          cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}`),
          cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`),
        ]).then(([relics, cards]: [Relic[], Card[]]) => {
          const rm: Record<string, Relic> = {};
          for (const r of relics) rm[r.id] = r;
          setRelicMap(rm);
          const cm: Record<string, Card> = {};
          for (const c of cards) cm[c.id] = c;
          setCardMap(cm);
        });
        return;
      }
    }

    Promise.all([
      cachedFetch<Character[]>(`${API}/api/characters?lang=${lang}`),
      cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}`),
      cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`),
    ])
      .then(([chars, relics, cards]: [Character[], Relic[], Card[]]) => {
        setCharacters(chars);
        const rm: Record<string, Relic> = {};
        for (const r of relics) rm[r.id] = r;
        setRelicMap(rm);
        const cm: Record<string, Card> = {};
        for (const c of cards) cm[c.id] = c;
        setCardMap(cm);
      })
      .finally(() => setLoading(false));
  }, [lang]);

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {characters.map((char) => {
        const style = colorStyles[char.color || ""] || "border-[var(--border-subtle)] from-gray-900/20";
        return (
          <Link
            href={`${lp}/characters/${char.id.toLowerCase()}`}
            key={char.id}
            className={`rounded-xl border-2 ${style} bg-gradient-to-br to-transparent bg-[var(--bg-card)] p-6 transition-all hover:shadow-lg hover:shadow-black/20 cursor-pointer`}
          >
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                {char.name}
              </h2>
              <img
                src={`${API}/static/images/characters/character_icon_${char.id.toLowerCase()}.webp`}
                alt={`${char.name} - Slay the Spire 2 Character`}
                className="w-10 h-10 rounded-full object-cover border-2 border-[var(--border-subtle)] ml-auto flex-shrink-0"
                loading="lazy"
                crossOrigin="anonymous"
              />
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              <RichDescription text={char.description} />
            </p>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">HP</div>
                <div className="text-xl font-bold text-red-400">
                  {char.starting_hp}
                </div>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">Gold</div>
                <div className="text-xl font-bold text-[var(--accent-gold)]">
                  {char.starting_gold}
                </div>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">Energy</div>
                <div className="text-xl font-bold text-amber-400">
                  {char.max_energy ?? 3}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Starting Deck ({char.starting_deck.length} cards)
              </h3>
              <div className="flex flex-wrap gap-1">
                {char.starting_deck.map((cardName, i) => {
                  const cardData = cardMap[toUpperSnake(cardName)];
                  return (
                    <span
                      key={`${cardName}-${i}`}
                      className="relative text-xs px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] cursor-help group/card"
                    >
                      {cardName.replace(/([A-Z])/g, " $1").trim()}
                      {cardData && (
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] leading-snug shadow-lg opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
                          <span className="block font-semibold text-[var(--text-primary)] mb-1">{cardData.name}</span>
                          <span className="block text-[var(--text-muted)] mb-1">{cardData.type} · Cost {cardData.cost}</span>
                          <span className="block"><RichDescription text={cleanDescription(cardData.description)} /></span>
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Starting Relic
              </h3>
              <div className="flex flex-wrap gap-1">
                {char.starting_relics.map((relicName) => {
                  const relicData = relicMap[toUpperSnake(relicName)];
                  return (
                    <span
                      key={relicName}
                      className="relative text-xs px-2 py-0.5 rounded bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20 cursor-help group/relic"
                    >
                      {relicName.replace(/([A-Z])/g, " $1").trim()}
                      {relicData && (
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] leading-snug shadow-lg opacity-0 group-hover/relic:opacity-100 transition-opacity z-10">
                          <span className="block font-semibold text-[var(--accent-gold)] mb-1">{relicData.name}</span>
                          <span className="block"><RichDescription text={cleanDescription(relicData.description)} /></span>
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
