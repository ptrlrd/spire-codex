"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Modifier } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ModifierDetail({ initialModifier }: { initialModifier?: Modifier | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [modifier, setModifier] = useState<Modifier | null>(initialModifier ?? null);
  const [loading, setLoading] = useState(!initialModifier);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Modifier>(`${API}/api/modifiers/${id}?lang=${lang}`)
      .then((data) => setModifier(data))
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

  if (notFound || !modifier) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Modifier not found.</p>
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
          {modifier.name}
        </h1>

        <div className="text-[var(--text-secondary)] leading-relaxed mb-6">
          <RichDescription text={modifier.description} />
        </div>

        <LocalizedNames entityType="modifiers" entityId={id} />
        <EntityHistory entityType="modifiers" entityId={id} />
      </div>
    </div>
  );
}
