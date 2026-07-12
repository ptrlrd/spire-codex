"use client";

import {
  useState,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Power, Card } from "@/lib/api";
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
import "../../power-ench-event-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Per-type accent for the wiki page spine (--spine).
const SPINE_BY_TYPE: Record<string, string> = {
  Buff: "var(--good)",
  Debuff: "#d9584a",
  None: "var(--accent-gold)",
};

export default function PowerDetail({ initialPower }: { initialPower?: Power | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [power, setPower] = useState<Power | null>(initialPower ?? null);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(!initialPower);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("description");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Power>(`${API}/api/powers/${id}?lang=${lang}`)
      .then((data) => setPower(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  useEffect(() => {
    cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`).then(setAllCards);
  }, [lang]);

  const relatedCards = useMemo(() => {
    if (!id || allCards.length === 0) return [];
    return allCards.filter((card) =>
      card.powers_applied?.some((pa) => {
        const powerId = pa.power.replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase();
        return powerId === id.toUpperCase();
      })
    );
  }, [id, allCards]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!power) return;
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
  }, [power, relatedCards.length]);

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

  if (notFound || !power) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Power not found.</p>
        <Link href={`${lp}/powers`} className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Powers
        </Link>
      </div>
    );
  }

  const spineColor = SPINE_BY_TYPE[power.type] ?? "var(--accent-gold)";
  const typeLabel = power.type === "None" ? "Neutral" : power.type;
  // Plain-text lede from the power effect (rich tags + newlines stripped).
  const ledeText = power.description
    ? power.description.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim()
    : "";

  const tocItems: { id: string; label: string }[] = [
    { id: "description", label: t("Description", lang) },
    ...(relatedCards.length > 0
      ? [{ id: "relations", label: t("Relations", lang) }]
      : []),
    { id: "history", label: t("Version history", lang) },
  ];

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": spineColor,
        ...(power.image_url ? { "--entity-bg": `url("${imageUrl(power.image_url)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <button className="cd-back" onClick={() => router.back()}>
          &larr; Back to Powers
        </button>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{typeLabel}</span>
              <span>&middot;</span>
              <span>{power.stack_type}</span>
            </p>
            <h1>{power.name}</h1>
            {ledeText && <p className="lede">{ledeText}</p>}
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

          {/* Description */}
          <section id="description">
            <h2>{t("Description", lang)}</h2>
            {power.description && (
              <div className="desc-quote">
                <RichDescription text={power.description} />
              </div>
            )}

            {/* Programmatic prose block, adds factual context using
                already-localized fields (name, type, stack_type) plus a
                count of cards that apply this power. Pushes the page past
                Google's "thin content" floor without per-language work. */}
            <EntityProse kind="power" power={power} appliedByCount={relatedCards.length} />
          </section>

          {/* Relations */}
          {relatedCards.length > 0 && (
            <section id="relations">
              <h2>{t("Relations", lang)}</h2>
              <p className="h-note">Cards that apply this power.</p>
              <div className="rel">
                <div className="rel-block">
                  <div className="rl">
                    {t("Cards", lang)} <span className="cnt">{relatedCards.length}</span>
                  </div>
                  <div className="chips">
                    {relatedCards.map((card) => (
                      <Link
                        key={card.id}
                        // Card route uses lowercase IDs everywhere, uppercase
                        // here would 404 on follow.
                        href={`${lp}/cards/${card.id.toLowerCase()}`}
                        className="cardlink"
                      >
                        {card.image_url && (
                          <img
                            className="cardimg xs"
                            src={imageUrl(card.image_url)}
                            alt=""
                            crossOrigin="anonymous"
                          />
                        )}
                        <span>
                          <span className="cln">{card.name}</span>
                          <span className="cls">{card.type}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Version history + localized names */}
          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="powers" entityId={id} />
            <EntityHistory entityType="powers" entityId={id} />
          </section>
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {power.image_url && (
              <div className="iconbox">
                <img
                  className="cardimg"
                  src={imageUrl(power.image_url)}
                  alt={`${power.name} - Slay the Spire 2 Power`}
                  crossOrigin="anonymous"
                />
              </div>
            )}

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                <div className="frow">
                  <dt>{t("Type", lang)}</dt>
                  <dd style={{ color: "var(--spine)" }}>{power.type}</dd>
                </div>
                <div className="frow">
                  <dt>Stacking</dt>
                  <dd>{power.stack_type}</dd>
                </div>
                {power.allow_negative != null && (
                  <div className="frow">
                    <dt>Negative allowed</dt>
                    <dd>{power.allow_negative ? "Yes" : "No"}</dd>
                  </div>
                )}
                {relatedCards.length > 0 && (
                  <div className="frow">
                    <dt>Applied by</dt>
                    <dd>
                      {relatedCards.length} {t("Cards", lang)}
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
