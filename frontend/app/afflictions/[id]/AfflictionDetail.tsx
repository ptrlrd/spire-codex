"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Affliction } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AfflictionDetail({ initialAffliction }: { initialAffliction?: Affliction | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [affliction, setAffliction] = useState<Affliction | null>(initialAffliction ?? null);
  const [loading, setLoading] = useState(!initialAffliction);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Affliction>(`${API}/api/afflictions/${id}?lang=${lang}`)
      .then((data) => setAffliction(data))
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

  if (notFound || !affliction) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Affliction not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Reference", lang)}
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-4">
          {affliction.name}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-6 text-sm">
          {affliction.is_stackable && (
            <span className="text-xs px-2 py-0.5 rounded border bg-cyan-950/50 text-cyan-300 border-cyan-900/30">
              Stackable
            </span>
          )}
        </div>

        <div className="text-[var(--text-secondary)] leading-relaxed mb-4">
          <RichDescription text={affliction.description} />
        </div>

        {affliction.extra_card_text && (
          <div className="mt-4 p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Card Text
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
              <RichDescription text={affliction.extra_card_text} />
            </p>
          </div>
        )}

        <div className="mt-6">
          <LocalizedNames entityType="afflictions" entityId={id} />
          <EntityHistory entityType="afflictions" entityId={id} />
        </div>
      </div>
    </div>
  );
}
