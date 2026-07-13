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
import EntityProse from "@/app/components/EntityProse";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import "../../card-revamp.css";
import "../../reference-extra.css";

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
    <div className="card-rvmp">
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </button>
      </div>

      <div className="wrap solo narrow">
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Modifier", lang)}</span>
            </p>
            <h1>{modifier.name}</h1>
            <EntityProse kind="modifier" modifier={modifier} lead />
          </div>

          <section id="description">
            <h2>{t("Description", lang)}</h2>
            <div className="desc-quote">
              <RichDescription text={modifier.description} />
            </div>
          </section>

          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="modifiers" entityId={id} />
            <EntityHistory entityType="modifiers" entityId={id} />
          </section>
        </main>
      </div>
    </div>
  );
}
