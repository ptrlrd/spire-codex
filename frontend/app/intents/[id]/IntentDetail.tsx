"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Intent } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";
import "../../card-revamp.css";
import "../../reference-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function IntentDetail({ initialIntent }: { initialIntent?: Intent | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [intent, setIntent] = useState<Intent | null>(initialIntent ?? null);
  const [loading, setLoading] = useState(!initialIntent);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Intent>(`${API}/api/intents/${id}?lang=${lang}`)
      .then((data) => setIntent(data))
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

  if (notFound || !intent) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Intent not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </Link>
      </div>
    );
  }

  // Plain-text lede: the effect with rich [tags] + whitespace stripped.
  const ledeText = intent.description
    ? intent.description.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim()
    : "";

  return (
    <div className="card-rvmp">
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </button>
      </div>

      <div className={`wrap${intent.image_url ? "" : " solo narrow"}`}>
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Intent", lang)}</span>
            </p>
            <h1>{intent.name}</h1>
            {ledeText && <p className="lede">{ledeText}</p>}
          </div>

          <section id="description">
            <h2>{t("Description", lang)}</h2>
            <div className="desc-quote">
              <RichDescription text={intent.description} />
            </div>
          </section>

          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="intents" entityId={id} />
            <EntityHistory entityType="intents" entityId={id} />
          </section>
        </main>

        {intent.image_url && (
          <aside className="aside">
            <div className="box">
              <div className="ref-icon">
                <img
                  src={imageUrl(intent.image_url)}
                  alt={`${intent.name} - Slay the Spire 2 Intent`}
                  crossOrigin="anonymous"
                />
              </div>
              <div className="facts">
                <div className="fh">{t("At a glance", lang)}</div>
                <dl>
                  <div className="frow">
                    <dt>{t("Type", lang)}</dt>
                    <dd>{t("Intent", lang)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
