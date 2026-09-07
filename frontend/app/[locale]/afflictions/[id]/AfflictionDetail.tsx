"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Affliction } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import "@/app/card-revamp.css";
import "@/app/reference-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AfflictionDetail({ initialAffliction }: { initialAffliction?: Affliction | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [affliction, setAffliction] = useState<Affliction | null>(initialAffliction ?? null);
  const [loading, setLoading] = useState(!initialAffliction);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Affliction>(`${API}/api/afflictions/${id}?lang=${lang}`)
      .then((data) => setAffliction(data))
      .catch(() => {
        if (!initialAffliction) setNotFound(true);
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

  if (notFound || !affliction) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Affliction not found.")}</p>
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
              <span>{t("Affliction")}</span>
              {affliction.is_stackable && (
                <>
                  <span>&middot;</span>
                  <span className="kw">{t("Stackable")}</span>
                </>
              )}
            </p>
            <h1>{affliction.name}</h1>
            <EntityProse kind="affliction" affliction={affliction} lead />
          </div>

          <section id="description">
            <h2>{t("Description")}</h2>
            <div className="desc-quote">
              <RichDescription text={affliction.description} />
            </div>
          </section>

          {affliction.extra_card_text && (
            <section id="card-text">
              <h2>{t("Card Text")}</h2>
              <div className="desc-body" style={{ fontStyle: "italic" }}>
                <RichDescription text={affliction.extra_card_text} />
              </div>
            </section>
          )}

          <LocalizedNames entityType="afflictions" entityId={id} />
          <EntityUpdateHistory entityType="afflictions" entityId={id} />
        </main>
      </div>
    </div>
  );
}
