"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Achievement } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import EntityProse from "@/app/components/EntityProse";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import "../../card-revamp.css";
import "../../meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AchievementDetail({ initialAchievement }: { initialAchievement?: Achievement | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [achievement, setAchievement] = useState<Achievement | null>(initialAchievement ?? null);
  const [loading, setLoading] = useState(!initialAchievement);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Achievement>(`${API}/api/achievements/${id}?lang=${lang}`)
      .then((data) => setAchievement(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!achievement) return;
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
  }, [achievement]);

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

  if (notFound || !achievement) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Achievement not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </Link>
      </div>
    );
  }

  const tocItems: { id: string; label: string }[] = [
    { id: "description", label: "Description" },
    { id: "history", label: "Version history" },
  ];

  return (
    <div className="card-rvmp" style={{ "--spine": "var(--accent-gold)" } as CSSProperties}>
      <div className="cd-top solo">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Reference", lang)}
        </button>
      </div>

      <div className="wrap solo">
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Reference", lang)}</span>
              <span>&middot;</span>
              <span>Achievement</span>
            </p>
            <h1>{achievement.name}</h1>
            <EntityProse kind="achievement" achievement={achievement} lead />
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
              <RichDescription text={achievement.description} />
            </div>
          </section>

          {/* Version history + localized names */}
          <section id="history">
            <h2>Version history</h2>
            <LocalizedNames entityType="achievements" entityId={id} />
            <EntityHistory entityType="achievements" entityId={id} />
          </section>
        </main>
      </div>
    </div>
  );
}
