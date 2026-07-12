"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Encounter } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import EntityProse from "@/app/components/EntityProse";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import "../../card-revamp.css";
import "../../monster-encounter-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Per-entity spine accent for the wiki page (--spine), keyed by room type.
const SPINE_BY_ROOM: Record<string, string> = {
  Boss: "var(--color-ironclad)",
  Elite: "var(--accent-gold)",
  Monster: "var(--color-silent)",
};

const roomTypeBadge: Record<string, string> = {
  Monster: "bg-gray-800 text-gray-300 border-gray-700",
  Elite: "bg-amber-950/50 text-amber-300 border-amber-900/30",
  Boss: "bg-red-950/50 text-red-300 border-red-900/30",
};

export default function EncounterDetail({ initialEncounter }: { initialEncounter?: Encounter | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [encounter, setEncounter] = useState<Encounter | null>(initialEncounter ?? null);
  const [loading, setLoading] = useState(!initialEncounter);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("composition");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Encounter>(`${API}/api/encounters/${id}?lang=${lang}`)
      .then((data) => setEncounter(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!encounter) return;
    const secs = Array.from(
      document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"),
    );
    if (secs.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        });
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [encounter]);

  const handleTocClick = (e: ReactMouseEvent, secId: string) => {
    e.preventDefault();
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(secId);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !encounter) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Encounter not found.</p>
        <Link href={`${lp}/encounters`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Encounters", lang)}
        </Link>
      </div>
    );
  }

  const spineColor = SPINE_BY_ROOM[encounter.room_type] ?? "var(--accent-gold)";
  const hasMonsters = !!(encounter.monsters && encounter.monsters.length > 0);
  const hasLoss = !!encounter.loss_text;

  const tocItems: { id: string; label: string }[] = [
    ...(hasMonsters ? [{ id: "composition", label: t("Monsters", lang) }] : []),
    ...(hasLoss ? [{ id: "loss", label: "Loss Text" }] : []),
    { id: "history", label: t("Version history", lang) },
  ];

  return (
    <div className="card-rvmp" style={{ "--spine": spineColor } as CSSProperties}>
      <div className="cd-top">
        <button type="button" onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Encounters", lang)}
        </button>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              {encounter.act && (
                <>
                  <span>{encounter.act}</span>
                  <span>&middot;</span>
                </>
              )}
              <span>
                {encounter.room_type}
                {encounter.is_weak && " (Weak)"}
              </span>
            </p>
            <h1>{encounter.name}</h1>
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page", lang)}>
            {tocItems.map((it) => (
              <a
                key={it.id}
                href={`#${it.id}`}
                className={activeSection === it.id ? "on" : undefined}
                onClick={(e) => handleTocClick(e, it.id)}
              >
                {it.label}
              </a>
            ))}
          </nav>

          {/* Composition (monsters in the fight) */}
          {hasMonsters && (
            <section id="composition">
              <h2>{t("Monsters", lang)}</h2>
              <p className="h-note">The enemies you fight in this encounter.</p>
              <div className="chips">
                {encounter.monsters!.map((m) => (
                  <Link key={m.id} href={`${lp}/monsters/${m.id}`} className="chip">
                    <span className="pip" />
                    <span className="cn">{m.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Loss text */}
          {hasLoss && (
            <section id="loss">
              <h2>Loss Text</h2>
              <p className="desc-body" style={{ fontStyle: "italic" }}>
                <RichDescription text={encounter.loss_text!} />
              </p>
            </section>
          )}

          {/* Version history + localized names */}
          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="encounters" entityId={id} />
            <EntityHistory entityType="encounters" entityId={id} />
          </section>

          {/* Programmatic prose block for SEO */}
          <EntityProse kind="encounter" encounter={encounter} />
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                <div className="frow">
                  <dt>Type</dt>
                  <dd>
                    <span className={`badge ${roomTypeBadge[encounter.room_type] || ""}`}>
                      {encounter.room_type}
                    </span>
                  </dd>
                </div>
                {encounter.is_weak && (
                  <div className="frow">
                    <dt>Variant</dt>
                    <dd style={{ color: "var(--good)" }}>Weak</dd>
                  </div>
                )}
                {encounter.act && (
                  <div className="frow">
                    <dt>Act</dt>
                    <dd>{encounter.act}</dd>
                  </div>
                )}
                {hasMonsters && (
                  <div className="frow">
                    <dt>{t("Monsters", lang)}</dt>
                    <dd>{encounter.monsters!.length}</dd>
                  </div>
                )}
                {encounter.tags && encounter.tags.length > 0 && (
                  <div className="frow">
                    <dt>Tags</dt>
                    <dd>
                      {encounter.tags.map((tag) => (
                        <span className="kw" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
