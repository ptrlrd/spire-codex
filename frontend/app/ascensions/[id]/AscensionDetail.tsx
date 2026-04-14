"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Ascension } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AscensionDetail({ initialAscension }: { initialAscension?: Ascension | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [ascension, setAscension] = useState<Ascension | null>(initialAscension ?? null);
  const [allAscensions, setAllAscensions] = useState<Ascension[]>([]);
  const [loading, setLoading] = useState(!initialAscension);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      cachedFetch<Ascension>(`${API}/api/ascensions/${id}?lang=${lang}`),
      cachedFetch<Ascension[]>(`${API}/api/ascensions?lang=${lang}`),
    ])
      .then(([asc, all]) => {
        setAscension(asc);
        setAllAscensions(all);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !ascension) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Ascension level not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Reference
        </Link>
      </div>
    );
  }

  // Find prev/next
  const sorted = allAscensions.sort((a, b) => a.level - b.level);
  const idx = sorted.findIndex((a) => a.id === ascension.id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Reference
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl font-bold text-rose-400">
            {ascension.level}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {ascension.name}
            </h1>
            <span className="text-sm text-[var(--text-muted)]">
              Ascension Level {ascension.level}
            </span>
          </div>
        </div>

        <div className="text-[var(--text-secondary)] leading-relaxed text-lg mb-6">
          <RichDescription text={ascension.description} />
        </div>

        {/* Prev/Next navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          {prev ? (
            <Link
              href={`${lp}/ascensions/${prev.id.toLowerCase()}`}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              &larr; Level {prev.level}: {prev.name}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`${lp}/ascensions/${next.id.toLowerCase()}`}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Level {next.level}: {next.name} &rarr;
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="mt-6">
          <LocalizedNames entityType="ascensions" entityId={id} />
          <EntityHistory entityType="ascensions" entityId={id} />
        </div>
      </div>
    </div>
  );
}
