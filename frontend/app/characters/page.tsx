"use client";

import { useState, useEffect } from "react";
import type { Character } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const colorStyles: Record<string, string> = {
  red: "border-red-700/60 from-red-900/20",
  green: "border-green-700/60 from-green-900/20",
  blue: "border-blue-700/60 from-blue-900/20",
  purple: "border-purple-700/60 from-purple-900/20",
  orange: "border-orange-700/60 from-orange-900/20",
};

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/characters`)
      .then((r) => r.json())
      .then(setCharacters)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">Characters</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {characters.map((char) => {
          const style = colorStyles[char.color || ""] || "border-[var(--border-subtle)] from-gray-900/20";
          return (
            <div
              key={char.id}
              className={`rounded-xl border-2 ${style} bg-gradient-to-br to-transparent bg-[var(--bg-card)] p-6 transition-all hover:shadow-lg hover:shadow-black/20`}
            >
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                  {char.name}
                </h2>
                <img
                  src={`${API}/static/images/characters/character_icon_${char.id.toLowerCase()}.png`}
                  alt={char.name}
                  className="w-10 h-10 rounded-full object-cover border-2 border-[var(--border-subtle)] ml-auto flex-shrink-0"
                  loading="lazy"
                />
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-5">
                {char.description}
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
                  {char.starting_deck.map((card, i) => (
                    <span
                      key={`${card}-${i}`}
                      className="text-xs px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    >
                      {card.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Starting Relic
                </h3>
                <div className="flex flex-wrap gap-1">
                  {char.starting_relics.map((relic) => (
                    <span
                      key={relic}
                      className="text-xs px-2 py-0.5 rounded bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20"
                    >
                      {relic.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
