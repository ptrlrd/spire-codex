"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Ascension } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import "@/app/card-revamp.css";
import "@/app/meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AscensionDetail({ initialAscension }: { initialAscension?: Ascension | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [ascension, setAscension] = useState<Ascension | null>(initialAscension ?? null);
  const [allAscensions, setAllAscensions] = useState<Ascension[]>([]);
  const [loading, setLoading] = useState(!initialAscension);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      cachedFetch<Ascension>(`${API}/api/ascensions/${id}?lang=${lang}`),
      cachedFetch<Ascension[]>(`${API}/api/ascensions?lang=${lang}`),
    ])
      .then(([asc, all]) => {
        setAscension(asc);
        setAllAscensions(all);
      })
      .catch(() => {
        if (!initialAscension) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!ascension) return;
    const secs = Array.from(document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"));
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
  }, [ascension, allAscensions.length]);

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
        {t("Loading...")}
      </div>
    );
  }

  if (notFound || !ascension) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Ascension level not found.")}</p>
        <Link href={`${bp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to")} {t("Reference")}
        </Link>
      </div>
    );
  }

  // Find prev/next
  const sorted = allAscensions.sort((a, b) => a.level - b.level);
  const idx = sorted.findIndex((a) => a.id === ascension.id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

  const tocItems: { id: string; label: string }[] = [
    { id: "description", label: t("Description") },
    ...(prev || next ? [{ id: "levels", label: t("Ascension levels") }] : []),
    { id: "history", label: t("Version history") },
  ];

  return (
    <div className="card-rvmp" style={{ "--spine": "var(--accent-gold)" } as CSSProperties}>
      <div className="cd-top solo">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to")} {t("Reference")}
        </button>
      </div>

      <div className="wrap solo">
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Ascension")}</span>
              <span>&middot;</span>
              <span>{t("Level {n}", { n: ascension.level })}</span>
            </p>
            <h1>{ascension.name}</h1>
            <EntityProse kind="ascension" ascension={ascension} lead />
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page")}>
            <span className="toc-label">{t("On this page")}</span>
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

          {/* Description */}
          <section id="description">
            <h2>{t("Description")}</h2>
            <div className="desc-quote">
              <RichDescription text={ascension.description} />
            </div>
          </section>

          {/* Prev/Next navigation */}
          {(prev || next) && (
            <section id="levels">
              <h2>{t("Ascension levels")}</h2>
              <div className="stepnav">
                {prev ? (
                  <Link href={`${bp}/ascensions/${prev.id.toLowerCase()}`}>
                    &larr; {t("Level {n}", { n: prev.level })}: {prev.name}
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link href={`${bp}/ascensions/${next.id.toLowerCase()}`}>
                    {t("Level {n}", { n: next.level })}: {next.name} &rarr;
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </section>
          )}

          {/* Version history + localized names */}
          <LocalizedNames entityType="ascensions" entityId={id} />
          <EntityUpdateHistory entityType="ascensions" entityId={id} />
        </main>
      </div>
    </div>
  );
}
