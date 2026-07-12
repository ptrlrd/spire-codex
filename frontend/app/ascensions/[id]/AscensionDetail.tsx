"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Ascension } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import "../../card-revamp.css";
import "../../meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AscensionDetail({ initialAscension }: { initialAscension?: Ascension | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
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
      .catch(() => setNotFound(true))
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
        Loading...
      </div>
    );
  }

  if (notFound || !ascension) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Ascension level not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Reference
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
    { id: "description", label: "Description" },
    ...(prev || next ? [{ id: "levels", label: "Ascension levels" }] : []),
    { id: "history", label: "Version history" },
  ];

  return (
    <div className="card-rvmp" style={{ "--spine": "var(--accent-gold)" } as CSSProperties}>
      <div className="cd-top solo">
        <button onClick={() => router.back()} className="cd-back">
          &larr; Back to Reference
        </button>
      </div>

      <div className="wrap solo">
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>Ascension</span>
              <span>&middot;</span>
              <span>Level {ascension.level}</span>
            </p>
            <h1>{ascension.name}</h1>
            <p className="lede">Ascension Level {ascension.level}</p>
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label="On this page">
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
            <h2>Description</h2>
            <div className="desc-quote">
              <RichDescription text={ascension.description} />
            </div>
          </section>

          {/* Prev/Next navigation */}
          {(prev || next) && (
            <section id="levels">
              <h2>Ascension levels</h2>
              <div className="stepnav">
                {prev ? (
                  <Link href={`${lp}/ascensions/${prev.id.toLowerCase()}`}>
                    &larr; Level {prev.level}: {prev.name}
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link href={`${lp}/ascensions/${next.id.toLowerCase()}`}>
                    Level {next.level}: {next.name} &rarr;
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </section>
          )}

          {/* Version history + localized names */}
          <section id="history">
            <h2>Version history</h2>
            <LocalizedNames entityType="ascensions" entityId={id} />
            <EntityHistory entityType="ascensions" entityId={id} />
          </section>
        </main>
      </div>
    </div>
  );
}
