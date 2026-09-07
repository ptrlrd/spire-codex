"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Orb } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";
import "@/app/card-revamp.css";
import "@/app/reference-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function OrbDetail({ initialOrb }: { initialOrb?: Orb | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [orb, setOrb] = useState<Orb | null>(initialOrb ?? null);
  const [loading, setLoading] = useState(!initialOrb);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Orb>(`${API}/api/orbs/${id}?lang=${lang}`)
      .then((data) => setOrb(data))
      .catch(() => {
        if (!initialOrb) setNotFound(true);
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

  if (notFound || !orb) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Orb not found.")}</p>
        <Link href={`${bp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to")} {t("Reference")}
        </Link>
      </div>
    );
  }

  const relGroups = [
    { label: t("Cards that Channel {name}", { name: orb.name }), items: orb.channeled_by_cards, route: "cards" },
    { label: t("Relics that Channel {name}", { name: orb.name }), items: orb.channeled_by_relics, route: "relics" },
  ];
  const hasRelations = relGroups.some((g) => g.items && g.items.length > 0);

  return (
    <div className="card-rvmp">
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to")} {t("Reference")}
        </button>
      </div>

      <div className={`wrap${orb.image_url ? "" : " solo narrow"}`}>
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Orb")}</span>
            </p>
            <h1>{orb.name}</h1>
            <EntityProse kind="orb" orb={orb} lead />
          </div>

          <section id="description">
            <h2>{t("Description")}</h2>
            <div className="desc-quote">
              <RichDescription text={orb.description} />
            </div>
          </section>

          {hasRelations && (
            <section id="relations">
              <h2>{t("Relations")}</h2>
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
                            href={`${bp}/${route}/${it.id.toLowerCase()}`}
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

          <LocalizedNames entityType="orbs" entityId={id} />
          <EntityUpdateHistory entityType="orbs" entityId={id} />
        </main>

        {orb.image_url && (
          <aside className="aside">
            <div className="box">
              <div className="ref-icon">
                <img
                  src={imageUrl(orb.image_url)}
                  alt={t("{name} - Slay the Spire 2 Orb", { name: orb.name })}
                  crossOrigin="anonymous"
                />
              </div>
              <div className="facts">
                <div className="fh">{t("At a glance")}</div>
                <dl>
                  <div className="frow">
                    <dt>{t("Type")}</dt>
                    <dd>{t("Orb")}</dd>
                  </div>
                  {orb.channeled_by_cards && orb.channeled_by_cards.length > 0 && (
                    <div className="frow">
                      <dt>{t("Cards")}</dt>
                      <dd>{orb.channeled_by_cards.length}</dd>
                    </div>
                  )}
                  {orb.channeled_by_relics && orb.channeled_by_relics.length > 0 && (
                    <div className="frow">
                      <dt>{t("Relics")}</dt>
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
