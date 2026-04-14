"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Power, Card } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeColors: Record<string, string> = {
  Buff: "text-emerald-400",
  Debuff: "text-red-400",
  None: "text-gray-400",
};

export default function PowerDetail({ initialPower }: { initialPower?: Power | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [power, setPower] = useState<Power | null>(initialPower ?? null);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(!initialPower);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Power>(`${API}/api/powers/${id}?lang=${lang}`)
      .then((data) => setPower(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  useEffect(() => {
    cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`).then(setAllCards);
  }, [lang]);

  const relatedCards = useMemo(() => {
    if (!id || allCards.length === 0) return [];
    return allCards.filter((card) =>
      card.powers_applied?.some((pa) => {
        const powerId = pa.power.replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase();
        return powerId === id.toUpperCase();
      })
    );
  }, [id, allCards]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !power) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Power not found.</p>
        <Link href={`${lp}/powers`} className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Powers
        </Link>
      </div>
    );
  }

  const typeColor = typeColors[power.type] || "text-gray-400";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Powers
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {power.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${API}${power.image_url}`}
              alt={`${power.name} - Slay the Spire 2 Power`}
              className="w-24 h-24 object-contain"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-4">
          {power.name}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-6 text-sm">
          <span className={typeColor}>{power.type}</span>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[var(--text-muted)]">{power.stack_type}</span>
        </div>

        {power.description && (
          <div className="text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={power.description} />
          </div>
        )}

        {relatedCards.length > 0 && (
          <div className="mt-6 pt-5 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Cards That Apply This Power
            </h3>
            <div className="flex flex-wrap gap-2">
              {relatedCards.map((card) => (
                <Link
                  key={card.id}
                  href={`${lp}/cards/${card.id}`}
                  className="text-xs px-2.5 py-1 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/40 hover:text-[var(--text-primary)] transition-colors"
                >
                  {card.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <LocalizedNames entityType="powers" entityId={id} />
        <EntityHistory entityType="powers" entityId={id} />
      </div>
    </div>
  );
}
