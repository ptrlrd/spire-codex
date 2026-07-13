"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Act } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import EntityProse from "@/app/components/EntityProse";
import "../../card-revamp.css";
import "../../meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ActDetail({ initialAct }: { initialAct?: Act | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [act, setAct] = useState<Act | null>(initialAct ?? null);
  const [loading, setLoading] = useState(!initialAct);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Act>(`${API}/api/acts/${id}?lang=${lang}`)
      .then((data) => setAct(data))
      .catch(() => setNotFound(true))
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
        Loading...
      </div>
    );
  }

  if (notFound || !act) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Act not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Reference
        </Link>
      </div>
    );
  }

  const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const tocItems: { id: string; label: string }[] = [
    ...(act.bosses.length > 0 ? [{ id: "bosses", label: "Bosses" }] : []),
    ...(act.encounters.length > 0 ? [{ id: "encounters", label: "Encounters" }] : []),
    ...(act.events.length > 0 ? [{ id: "events", label: "Events" }] : []),
    ...(act.ancients.length > 0 ? [{ id: "ancients", label: "Ancients" }] : []),
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
              <span>Act</span>
              {act.num_rooms != null && (
                <>
                  <span>&middot;</span>
                  <span>{act.num_rooms} rooms</span>
                </>
              )}
            </p>
            <h1>{act.name}</h1>
            <EntityProse kind="act" act={act} lead />
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

          {/* Bosses */}
          {act.bosses.length > 0 && (
            <section id="bosses">
              <h2>Bosses ({act.bosses.length})</h2>
              <div className="chips">
                {act.bosses.map((b) => (
                  <Link key={b} href={`${lp}/encounters/${b.toLowerCase()}`} className="chip">
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
              <h2>Encounters ({act.encounters.length})</h2>
              <div className="chips">
                {act.encounters.map((e) => (
                  <Link key={e} href={`${lp}/encounters/${e.toLowerCase()}`} className="chip">
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
              <h2>Events ({act.events.length})</h2>
              <div className="chips">
                {act.events.map((e) => (
                  <Link key={e} href={`${lp}/events/${e.toLowerCase()}`} className="chip">
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
              <h2>Ancients</h2>
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
          <section id="history">
            <h2>Version history</h2>
            <LocalizedNames entityType="acts" entityId={id} />
            <EntityHistory entityType="acts" entityId={id} />
          </section>
        </main>
      </div>
    </div>
  );
}
