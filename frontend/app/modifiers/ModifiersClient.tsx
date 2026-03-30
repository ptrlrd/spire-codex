"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Modifier {
  id: string;
  name: string;
  description: string;
}

// Enriched data from C# source analysis
const MODIFIER_TAGS: Record<string, string[]> = {
  DRAFT: ["Clears Starter Deck", "Replaces Neow", "Prevents Pandora's Box"],
  SEALED_DECK: ["Clears Starter Deck", "Replaces Neow", "Prevents Pandora's Box"],
  INSANITY: ["Clears Starter Deck", "Replaces Neow", "Prevents Pandora's Box"],
  ALL_STAR: ["Replaces Neow"],
  SPECIALIZED: ["Replaces Neow"],
};

const TAG_COLORS: Record<string, string> = {
  "Clears Starter Deck": "bg-[var(--color-ironclad)]/15 text-[var(--color-ironclad)] border-[var(--color-ironclad)]/30",
  "Replaces Neow": "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30",
  "Prevents Pandora's Box": "bg-[var(--color-necrobinder)]/15 text-[var(--color-necrobinder)] border-[var(--color-necrobinder)]/30",
};

const MODIFIER_NOTES: Record<string, string> = {
  DRAFT: "Neow is replaced with a draft selection of 10 card rewards to build your starting deck.",
  SEALED_DECK: "Neow is replaced with a selection of 10 out of 30 random cards to build your starting deck.",
  INSANITY: "Neow is replaced with a random deck of 30 cards. Your starter deck and relics are removed.",
  ALL_STAR: "Neow is replaced with a selection of 5 colorless cards to add to your deck.",
  SPECIALIZED: "Neow is replaced with a selection of 5 copies of a single card.",
};

export default function ModifiersClient() {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedFetch<Modifier[]>(`${API}/api/modifiers?lang=${lang}`)
      .then(setModifiers)
      .finally(() => setLoading(false));
  }, [lang]);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">Loading...</div>;
  }

  const deckModifiers = modifiers.filter((m) => MODIFIER_TAGS[m.id]?.includes("Clears Starter Deck"));
  const neowModifiers = modifiers.filter((m) => MODIFIER_TAGS[m.id]?.includes("Replaces Neow") && !MODIFIER_TAGS[m.id]?.includes("Clears Starter Deck"));
  const otherModifiers = modifiers.filter((m) => !MODIFIER_TAGS[m.id]?.length);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Custom Mode Modifiers
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        All {modifiers.length} modifiers available in Custom Mode. Some modifiers replace your starting deck and change how Neow works.
      </p>

      {/* Deck Replacement Modifiers */}
      {deckModifiers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Deck Replacement Modifiers
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            These modifiers clear your starter deck and replace the Neow encounter. When active, Pandora&apos;s Box will not be offered by Darv.
          </p>
          <div className="space-y-3">
            {deckModifiers.map((mod) => (
              <ModifierCard key={mod.id} mod={mod} lp={lp} />
            ))}
          </div>
        </div>
      )}

      {/* Neow Replacement Modifiers */}
      {neowModifiers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Neow Replacement Modifiers
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            These modifiers replace Neow&apos;s normal relic offerings with a custom selection.
          </p>
          <div className="space-y-3">
            {neowModifiers.map((mod) => (
              <ModifierCard key={mod.id} mod={mod} lp={lp} />
            ))}
          </div>
        </div>
      )}

      {/* Other Modifiers */}
      {otherModifiers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Other Modifiers
          </h2>
          <div className="space-y-3">
            {otherModifiers.map((mod) => (
              <ModifierCard key={mod.id} mod={mod} lp={lp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModifierCard({ mod, lp }: { mod: Modifier; lp: string }) {
  const tags = MODIFIER_TAGS[mod.id] || [];
  const note = MODIFIER_NOTES[mod.id];

  return (
    <Link
      href={`${lp}/modifiers/${mod.id.toLowerCase()}`}
      className="block bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-[var(--text-primary)]">{mod.name}</h3>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 ml-2">
            {tags.map((tag) => (
              <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded border ${TAG_COLORS[tag] || "bg-[var(--bg-primary)] text-[var(--text-muted)] border-[var(--border-subtle)]"}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
        <RichDescription text={mod.description} />
      </div>
      {note && (
        <p className="text-xs text-[var(--text-muted)] mt-2 italic">{note}</p>
      )}
    </Link>
  );
}
