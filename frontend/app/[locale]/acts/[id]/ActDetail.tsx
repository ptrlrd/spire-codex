"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Act } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import "@/app/card-revamp.css";
import "@/app/meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ActDetail({ initialAct }: { initialAct?: Act | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [act, setAct] = useState<Act | null>(initialAct ?? null);
  const [loading, setLoading] = useState(!initialAct);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Act>(`${API}/api/acts/${id}?lang=${lang}`)
      .then((data) => setAct(data))
      .catch(() => {
        if (!initialAct) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!act) return;
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
  }, [act]);

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
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        {t("Loading...")}
      </div>
    );
  }

  if (notFound || !act) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Act not found.")}</p>
        <Link prefetch={false} href={`${bp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to")} {t("Reference")}
        </Link>
      </div>
    );
  }

  const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const tocItems: { id: string; label: string }[] = [
    ...(act.bosses.length > 0 ? [{ id: "bosses", label: t("Bosses") }] : []),
    ...(act.encounters.length > 0 ? [{ id: "encounters", label: t("Encounters") }] : []),
    ...(act.events.length > 0 ? [{ id: "events", label: t("Events") }] : []),
    ...(act.ancients.length > 0 ? [{ id: "ancients", label: t("Ancients") }] : []),
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
              <span>{t("Act")}</span>
              {act.num_rooms != null && (
                <>
                  <span>&middot;</span>
                  <span>{t("{n} rooms", { n: act.num_rooms })}</span>
                </>
              )}
            </p>
            <h1>{act.name}</h1>
            <EntityProse kind="act" act={act} lead />
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

          {/* Bosses */}
          {act.bosses.length > 0 && (
            <section id="bosses">
              <h2>{t("Bosses")} ({act.bosses.length})</h2>
              <div className="chips">
                {act.bosses.map((b) => (
                  <Link prefetch={false} key={b} href={`${bp}/encounters/${b.toLowerCase()}`} className="chip">
                    <span className="pip" style={{ background: "#b3423a" }} />
                    {titleCase(b).replace(/ Boss$/, "")}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Encounters */}
          {act.encounters.length > 0 && (
            <section id="encounters">
              <h2>{t("Encounters")} ({act.encounters.length})</h2>
              <div className="chips">
                {act.encounters.map((e) => (
                  <Link prefetch={false} key={e} href={`${bp}/encounters/${e.toLowerCase()}`} className="chip">
                    <span className="pip" />
                    {titleCase(e).replace(/ (Normal|Weak|Elite|Boss)$/, "")}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Events */}
          {act.events.length > 0 && (
            <section id="events">
              <h2>{t("Events")} ({act.events.length})</h2>
              <div className="chips">
                {act.events.map((e) => (
                  <Link prefetch={false} key={e} href={`${bp}/events/${e.toLowerCase()}`} className="chip">
                    <span className="pip" style={{ background: "#4f7fb3" }} />
                    {titleCase(e)}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Ancients */}
          {act.ancients.length > 0 && (
            <section id="ancients">
              <h2>{t("Ancients")}</h2>
              <div className="chips">
                {[...new Set(act.ancients)].map((a) => (
                  <span key={a} className="chip">
                    <span className="pip" style={{ background: "#8a5cc4" }} />
                    {titleCase(a)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Version history + localized names */}
          <LocalizedNames entityType="acts" entityId={id} />
          <EntityUpdateHistory entityType="acts" entityId={id} />
        </main>
      </div>
    </div>
  );
}
