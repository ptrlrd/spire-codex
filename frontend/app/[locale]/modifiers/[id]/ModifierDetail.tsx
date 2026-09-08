"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Modifier } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import "@/app/card-revamp.css";
import "@/app/reference-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ModifierDetail({ initialModifier }: { initialModifier?: Modifier | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [modifier, setModifier] = useState<Modifier | null>(initialModifier ?? null);
  const [loading, setLoading] = useState(!initialModifier);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Modifier>(`${API}/api/modifiers/${id}?lang=${lang}`)
      .then((data) => setModifier(data))
      .catch(() => {
        if (!initialModifier) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        {t("Loading...")}
      </div>
    );
  }

  if (notFound || !modifier) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Modifier not found.")}</p>
        <Link href={`${bp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to")} {t("Reference")}
        </Link>
      </div>
    );
  }

  return (
    <div className="card-rvmp">
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to")} {t("Reference")}
        </button>
      </div>

      <div className="wrap solo narrow">
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Modifier")}</span>
            </p>
            <h1>{modifier.name}</h1>
            <EntityProse kind="modifier" modifier={modifier} lead />
          </div>

          <section id="description">
            <h2>{t("Description")}</h2>
            <div className="desc-quote">
              <RichDescription text={modifier.description} />
            </div>
          </section>

          <LocalizedNames entityType="modifiers" entityId={id} />
          <EntityUpdateHistory entityType="modifiers" entityId={id} />
        </main>
      </div>
    </div>
  );
}
