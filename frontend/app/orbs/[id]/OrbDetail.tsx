"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Orb } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import EntityProse from "@/app/components/EntityProse";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";
import "../../card-revamp.css";
import "../../reference-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function OrbDetail({ initialOrb }: { initialOrb?: Orb | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [orb, setOrb] = useState<Orb | null>(initialOrb ?? null);
  const [loading, setLoading] = useState(!initialOrb);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Orb>(`${API}/api/orbs/${id}?lang=${lang}`)
      .then((data) => setOrb(data))
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

  if (notFound || !orb) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Orb not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </Link>
      </div>
    );
  }

  const relGroups = [
    { label: `Cards that Channel ${orb.name}`, items: orb.channeled_by_cards, route: "cards" },
    { label: `Relics that Channel ${orb.name}`, items: orb.channeled_by_relics, route: "relics" },
  ];
  const hasRelations = relGroups.some((g) => g.items && g.items.length > 0);

  return (
    <div className="card-rvmp">
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </button>
      </div>

      <div className={`wrap${orb.image_url ? "" : " solo narrow"}`}>
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Orb", lang)}</span>
            </p>
            <h1>{orb.name}</h1>
            <EntityProse kind="orb" orb={orb} lead />
          </div>

          <section id="description">
            <h2>{t("Description", lang)}</h2>
            <div className="desc-quote">
              <RichDescription text={orb.description} />
            </div>
          </section>

          {hasRelations && (
            <section id="relations">
              <h2>{t("Relations", lang)}</h2>
              <div className="rel">
                {relGroups.map(({ label, items, route }) =>
                  items && items.length > 0 ? (
                    <div key={route} className="rel-block">
                      <div className="rl">
                        {label} <span className="cnt">{items.length}</span>
                      </div>
                      <div className="chips">
                        {items.map((it) => (
                          <Link
                            key={it.id}
                            href={`${lp}/${route}/${it.id.toLowerCase()}`}
                            className="chip"
                          >
                            <span className="pip" />
                            {it.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          )}

          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="orbs" entityId={id} />
            <EntityHistory entityType="orbs" entityId={id} />
          </section>
        </main>

        {orb.image_url && (
          <aside className="aside">
            <div className="box">
              <div className="ref-icon">
                <img
                  src={imageUrl(orb.image_url)}
                  alt={`${orb.name} - Slay the Spire 2 Orb`}
                  crossOrigin="anonymous"
                />
              </div>
              <div className="facts">
                <div className="fh">{t("At a glance", lang)}</div>
                <dl>
                  <div className="frow">
                    <dt>{t("Type", lang)}</dt>
                    <dd>{t("Orb", lang)}</dd>
                  </div>
                  {orb.channeled_by_cards && orb.channeled_by_cards.length > 0 && (
                    <div className="frow">
                      <dt>{t("Cards", lang)}</dt>
                      <dd>{orb.channeled_by_cards.length}</dd>
                    </div>
                  )}
                  {orb.channeled_by_relics && orb.channeled_by_relics.length > 0 && (
                    <div className="frow">
                      <dt>{t("Relics", lang)}</dt>
                      <dd>{orb.channeled_by_relics.length}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
