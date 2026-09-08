"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "@/app/components/RichDescription";
import { useBetaPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Modifier {
  id: string;
  name: string;
  description: string;
}

type Tag = "clears_deck" | "replaces_neow" | "no_pandora";

const MODIFIER_TAGS: Record<string, Tag[]> = {
  DRAFT: ["clears_deck", "replaces_neow", "no_pandora"],
  SEALED_DECK: ["clears_deck", "replaces_neow", "no_pandora"],
  INSANITY: ["clears_deck", "replaces_neow", "no_pandora"],
  ALL_STAR: ["replaces_neow"],
  SPECIALIZED: ["replaces_neow"],
};

const TAG_KEYS: Record<Tag, string> = {
  clears_deck: "Clears Starter Deck",
  replaces_neow: "Replaces {neow}",
  no_pandora: "Prevents {relic}",
};

const TAG_COLORS: Record<Tag, string> = {
  clears_deck: "bg-[var(--color-ironclad)]/15 text-[var(--color-ironclad)] border-[var(--color-ironclad)]/30",
  replaces_neow: "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30",
  no_pandora: "bg-[var(--color-necrobinder)]/15 text-[var(--color-necrobinder)] border-[var(--color-necrobinder)]/30",
};

const MODIFIER_NOTES: Record<string, string> = {
  DRAFT: "{neow} is replaced with a draft selection of 10 card rewards to build your starting deck.",
  SEALED_DECK: "{neow} is replaced with a selection of 10 out of 30 random cards to build your starting deck.",
  INSANITY: "{neow} is replaced with a random deck of 30 cards. Your starter deck and relics are removed.",
  ALL_STAR: "{neow} is replaced with a selection of 5 colorless cards to add to your deck.",
  SPECIALIZED: "{neow} is replaced with a selection of 5 copies of a single card.",
};

interface GameNames extends Record<string, string> {
  neow: string;
  relic: string;
  darv: string;
}

export default function ModifiersClient() {
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [names, setNames] = useState<GameNames>({ neow: "Neow", relic: "Pandora's Box", darv: "Darv" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedFetch<Modifier[]>(`${API}/api/modifiers?lang=${lang}`)
      .then(setModifiers)
      .finally(() => setLoading(false));
    Promise.all([
      cachedFetch<{ name: string }>(`${API}/api/events/neow?lang=${lang}`),
      cachedFetch<{ name: string }>(`${API}/api/relics/pandoras_box?lang=${lang}`),
      cachedFetch<{ name: string }>(`${API}/api/events/darv?lang=${lang}`),
    ])
      .then(([neow, relic, darv]) => setNames({ neow: neow.name || "Neow", relic: relic.name || "Pandora's Box", darv: darv.name || "Darv" }))
      .catch(() => {});
  }, [lang]);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">{t("Loading...")}</div>;
  }

  const deckModifiers = modifiers.filter((m) => MODIFIER_TAGS[m.id]?.includes("clears_deck"));
  const neowModifiers = modifiers.filter((m) => MODIFIER_TAGS[m.id]?.includes("replaces_neow") && !MODIFIER_TAGS[m.id]?.includes("clears_deck"));
  const otherModifiers = modifiers.filter((m) => !MODIFIER_TAGS[m.id]?.length);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {t("Custom Mode Modifiers")}
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        {t("All {n} modifiers available in Custom Mode. Some modifiers replace your starting deck and change how {neow} works.", { n: modifiers.length, neow: names.neow })}
      </p>

      {/* Deck Replacement Modifiers */}
      {deckModifiers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            {t("Deck Replacement Modifiers")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("These modifiers clear your starter deck and replace the {neow} encounter. When active, {relic} will not be offered by {darv}.", names)}
          </p>
          <div className="space-y-3">
            {deckModifiers.map((mod) => (
              <ModifierCard key={mod.id} mod={mod} bp={bp} names={names} />
            ))}
          </div>
        </div>
      )}

      {/* Neow Replacement Modifiers */}
      {neowModifiers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            {t("{neow} Replacement Modifiers", names)}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("These modifiers replace the normal relic offerings of {neow} with a custom selection.", names)}
          </p>
          <div className="space-y-3">
            {neowModifiers.map((mod) => (
              <ModifierCard key={mod.id} mod={mod} bp={bp} names={names} />
            ))}
          </div>
        </div>
      )}

      {/* Other Modifiers */}
      {otherModifiers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            {t("Other Modifiers")}
          </h2>
          <div className="space-y-3">
            {otherModifiers.map((mod) => (
              <ModifierCard key={mod.id} mod={mod} bp={bp} names={names} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModifierCard({ mod, bp, names }: { mod: Modifier; bp: string; names: GameNames }) {
  const t = useT();
  const tags = MODIFIER_TAGS[mod.id] || [];
  const note = MODIFIER_NOTES[mod.id];

  return (
    <Link
      href={`${bp}/modifiers/${mod.id.toLowerCase()}`}
      className="block bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-[var(--text-primary)]">{mod.name}</h3>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 ml-2">
            {tags.map((tag) => (
              <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded border ${TAG_COLORS[tag]}`}>
                {t(TAG_KEYS[tag], names)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
        <RichDescription text={mod.description} />
      </div>
      {note && (
        <p className="text-xs text-[var(--text-muted)] mt-2 italic">{t(note, names)}</p>
      )}
    </Link>
  );
}
