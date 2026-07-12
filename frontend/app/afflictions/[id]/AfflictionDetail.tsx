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
import "../../card-revamp.css";
import "../../reference-extra.css";

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

  // Plain-text lede: the effect with rich [tags] + whitespace stripped.
  const ledeText = affliction.description
    ? affliction.description.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim()
    : "";

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
              <span>{t("Affliction", lang)}</span>
              {affliction.is_stackable && (
                <>
                  <span>&middot;</span>
                  <span className="kw">Stackable</span>
                </>
              )}
            </p>
            <h1>{affliction.name}</h1>
            {ledeText && <p className="lede">{ledeText}</p>}
          </div>

          <section id="description">
            <h2>{t("Description", lang)}</h2>
            <div className="desc-quote">
              <RichDescription text={affliction.description} />
            </div>
          </section>

          {affliction.extra_card_text && (
            <section id="card-text">
              <h2>Card Text</h2>
              <div className="desc-body" style={{ fontStyle: "italic" }}>
                <RichDescription text={affliction.extra_card_text} />
              </div>
            </section>
          )}

          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="afflictions" entityId={id} />
            <EntityHistory entityType="afflictions" entityId={id} />
          </section>
        </main>
      </div>
    </div>
  );
}
