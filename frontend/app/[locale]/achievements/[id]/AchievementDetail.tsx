"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Achievement } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import "@/app/card-revamp.css";
import "@/app/meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AchievementDetail({ initialAchievement }: { initialAchievement?: Achievement | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [achievement, setAchievement] = useState<Achievement | null>(initialAchievement ?? null);
  const [loading, setLoading] = useState(!initialAchievement);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Achievement>(`${API}/api/achievements/${id}?lang=${lang}`)
      .then((data) => setAchievement(data))
      .catch(() => {
        if (!initialAchievement) setNotFound(true);
      })
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
        {t("Loading...")}
      </div>
    );
  }

  if (notFound || !achievement) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Achievement not found.")}</p>
        <Link href={`${bp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to")} {t("Reference")}
        </Link>
      </div>
    );
  }

  const tocItems: { id: string; label: string }[] = [
    { id: "description", label: t("Description") },
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
              <span>{t("Reference")}</span>
              <span>&middot;</span>
              <span>{t("Achievement")}</span>
            </p>
            <h1>{achievement.name}</h1>
            <EntityProse kind="achievement" achievement={achievement} lead />
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
              <RichDescription text={achievement.description} />
            </div>
          </section>

          {/* Version history + localized names */}
          <LocalizedNames entityType="achievements" entityId={id} />
          <EntityUpdateHistory entityType="achievements" entityId={id} />
        </main>
      </div>
    </div>
  );
}
