"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import RichDescription from "@/app/components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface UnlockEntity {
  id: string;
  name: string;
  type?: string;
  rarity?: string;
  color?: string;
  character: string;
  image_url: string | null;
  epoch_id: string;
  epoch_title: string;
  era: string;
  unlock_info: string;
  sort_order: number;
}

interface CharacterUnlock {
  id: string;
  name: string;
  epoch_id: string;
  epoch_title: string;
  era: string;
  unlock_info: string;
  sort_order: number;
}

interface UnlocksData {
  characters: CharacterUnlock[];
  cards: UnlockEntity[];
  relics: UnlockEntity[];
  potions: UnlockEntity[];
  events: UnlockEntity[];
}

type Tab = "all" | "characters" | "cards" | "relics" | "potions";
type CharFilter = "all" | "ironclad" | "silent" | "defect" | "regent" | "necrobinder" | "shared";

const CHAR_COLORS: Record<string, string> = {
  Ironclad: "var(--color-ironclad)",
  Silent: "var(--color-silent)",
  Defect: "var(--color-defect)",
  Regent: "var(--color-regent)",
  Necrobinder: "var(--color-necrobinder)",
  Shared: "var(--text-muted)",
};

function EntityCard({ entity, type, lp }: { entity: UnlockEntity; type: string; lp: string }) {
  const href = `${lp}/${type}/${entity.id.toLowerCase()}`;
  const charColor = CHAR_COLORS[entity.character] || "var(--text-muted)";

  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/50 transition-colors group"
    >
      {entity.image_url && (
        <img
          src={`${API}${entity.image_url}`}
          alt={entity.name}
          className="w-8 h-8 object-contain flex-shrink-0"
          crossOrigin="anonymous"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors truncate">
          {entity.name}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          {entity.rarity && <span>{entity.rarity}</span>}
          {entity.type && <span>{entity.type}</span>}
          <span>&middot;</span>
          <span style={{ color: charColor }}>{entity.character}</span>
        </div>
        {entity.unlock_info && (
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            <RichDescription text={entity.unlock_info} />
          </div>
        )}
      </div>
    </Link>
  );
}

export default function UnlocksClient() {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [data, setData] = useState<UnlocksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [charFilter, setCharFilter] = useState<CharFilter>("all");

  useEffect(() => {
    cachedFetch<UnlocksData>(`${API}/api/unlocks?lang=${lang}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lang]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  if (!data) return null;

  const filterByChar = (entities: UnlockEntity[]) =>
    charFilter === "all" ? entities : entities.filter((e) => e.character.toLowerCase() === charFilter);

  const filteredCards = filterByChar(data.cards);
  const filteredRelics = filterByChar(data.relics);
  const filteredPotions = filterByChar(data.potions);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: data.characters.length + data.cards.length + data.relics.length + data.potions.length },
    { key: "characters", label: "Characters", count: data.characters.length },
    { key: "cards", label: "Cards", count: data.cards.length },
    { key: "relics", label: "Relics", count: data.relics.length },
    { key: "potions", label: "Potions", count: data.potions.length },
  ];

  const charFilters: { key: CharFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "ironclad", label: "Ironclad" },
    { key: "silent", label: "Silent" },
    { key: "defect", label: "Defect" },
    { key: "regent", label: "Regent" },
    { key: "necrobinder", label: "Necrobinder" },
    { key: "shared", label: "Shared" },
  ];

  const showCharacters = tab === "all" || tab === "characters";
  const showCards = tab === "all" || tab === "cards";
  const showRelics = tab === "all" || tab === "relics";
  const showPotions = tab === "all" || tab === "potions";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Unlocks</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        All unlockable content in Slay the Spire 2, earned through timeline progression.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              tab === t.key
                ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30"
                : "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Character filter */}
      {(tab === "all" || tab === "cards" || tab === "relics" || tab === "potions") && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {charFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setCharFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                charFilter === f.key
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--text-muted)]"
                  : "text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]"
              }`}
              style={charFilter === f.key && f.key !== "all" ? { borderColor: CHAR_COLORS[f.label] || undefined, color: CHAR_COLORS[f.label] || undefined } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Characters */}
      {showCharacters && data.characters.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Characters ({data.characters.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.characters.map((char) => (
              <Link
                key={char.id}
                href={`${lp}/characters/${char.id.toLowerCase()}`}
                className="flex items-center gap-3 px-3 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/50 transition-colors group"
              >
                <img
                  src={`${API}/static/images/characters/combat_${char.id.toLowerCase()}.webp`}
                  alt={char.name}
                  className="w-12 h-12 object-contain flex-shrink-0"
                  crossOrigin="anonymous"
                />
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                    {char.name}
                  </div>
                  {char.unlock_info && (
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      <RichDescription text={char.unlock_info} />
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Cards */}
      {showCards && filteredCards.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Cards ({filteredCards.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredCards.map((e) => (
              <EntityCard key={e.id} entity={e} type="cards" lp={lp} />
            ))}
          </div>
        </section>
      )}

      {/* Relics */}
      {showRelics && filteredRelics.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Relics ({filteredRelics.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredRelics.map((e) => (
              <EntityCard key={e.id} entity={e} type="relics" lp={lp} />
            ))}
          </div>
        </section>
      )}

      {/* Potions */}
      {showPotions && filteredPotions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Potions ({filteredPotions.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredPotions.map((e) => (
              <EntityCard key={e.id} entity={e} type="potions" lp={lp} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
