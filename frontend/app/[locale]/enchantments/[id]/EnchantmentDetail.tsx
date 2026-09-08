"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import {
  useState,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Enchantment } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityUpdateHistory from "@/app/components/EntityUpdateHistory";
import EntityProse from "@/app/components/EntityProse";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import { imageUrl, enchantedCardUrl } from "@/lib/image-url";
import "@/app/card-revamp.css";
import "@/app/power-ench-event-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function EnchantmentDetail({
  initialEnchantment,
  cardIds = [],
  totalCards = 0,
}: {
  initialEnchantment?: Enchantment | null;
  cardIds?: string[];
  totalCards?: number;
} = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const [enchantment, setEnchantment] = useState<Enchantment | null>(initialEnchantment ?? null);
  const [loading, setLoading] = useState(!initialEnchantment);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("description");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Enchantment>(`${API}/api/enchantments/${id}?lang=${lang}`)
      .then((data) => setEnchantment(data))
      .catch(() => {
        if (!initialEnchantment) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!enchantment) return;
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
  }, [enchantment, cardIds.length]);

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

  if (notFound || !enchantment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Enchantment not found.")}</p>
        <Link prefetch={false} href={`${bp}/enchantments`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to")} {t("Enchantments")}
        </Link>
      </div>
    );
  }

  const cardTypes = enchantment.card_type ? enchantment.card_type.split(", ") : [];

  const tocItems: { id: string; label: string }[] = [
    { id: "description", label: t("Description") },
    ...(cardIds.length > 0 ? [{ id: "cards", label: t("Cards") }] : []),
    { id: "history", label: t("Version history") },
  ];

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": "#a684e8",
        ...(enchantment.image_url ? { "--entity-bg": `url("${imageUrl(enchantment.image_url)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <button className="cd-back" onClick={() => router.back()}>
          &larr; {t("Back to")} {t("Enchantments")}
        </button>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{cardTypes.length > 0 ? cardTypes.join(" · ") : t("All cards")}</span>
              {enchantment.is_stackable && (
                <>
                  <span>&middot;</span>
                  <span>{t("Stackable")}</span>
                </>
              )}
            </p>
            <h1>{enchantment.name}</h1>
            <EntityProse kind="enchantment" enchantment={enchantment} lead />
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
              <RichDescription text={enchantment.description} />
            </div>

            {enchantment.extra_card_text && (
              <>
                <h3 className="subh">{t("Card Text")}</h3>
                <div className="desc-body" style={{ fontStyle: "italic" }}>
                  <RichDescription text={enchantment.extra_card_text} />
                </div>
              </>
            )}
          </section>

          {/* Cards it can apply to */}
          {cardIds.length > 0 && (
            <section id="cards">
              <h2>{t("Cards")}</h2>
              <p className="h-note">
                {cardIds.length < totalCards
                  ? t("{name} applied to {n} cards (showing {shown}).", { name: enchantment.name, n: totalCards.toLocaleString(), shown: cardIds.length })
                  : t("{name} applied to {n} cards.", { name: enchantment.name, n: totalCards.toLocaleString() })}
              </p>
              <div className="ench-grid">
                {cardIds.map((cid) => {
                  const cardName = cid
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  return (
                    <Link prefetch={false} key={cid} href={`${bp}/cards/${cid}`} className="ench-cell">
                      <img
                        src={enchantedCardUrl(cid, id, false, "stable", lang)}
                        alt={t("{card} with {name} - Slay the Spire 2", { card: cid, name: enchantment.name })}
                        loading="lazy"
                        crossOrigin="anonymous"
                      />
                      <div className="ench-name">{cardName}</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <LocalizedNames entityType="enchantments" entityId={id} />
          <EntityUpdateHistory entityType="enchantments" entityId={id} />
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {enchantment.image_url && (
              <div className="iconbox">
                <img
                  className="cardimg"
                  src={imageUrl(enchantment.image_url)}
                  alt={t("{name} - Slay the Spire 2 Enchantment", { name: enchantment.name })}
                  crossOrigin="anonymous"
                />
              </div>
            )}

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance")}</div>
              <dl>
                <div className="frow">
                  <dt>{t("Card type")}</dt>
                  <dd>
                    {cardTypes.length > 0 ? (
                      cardTypes.map((tp) => (
                        <span className="kw" key={tp}>
                          {tp}
                        </span>
                      ))
                    ) : (
                      <span>{t("All")}</span>
                    )}
                  </dd>
                </div>
                {enchantment.applicable_to && (
                  <div className="frow">
                    <dt>{t("Applies to")}</dt>
                    <dd>{enchantment.applicable_to}</dd>
                  </div>
                )}
                <div className="frow">
                  <dt>{t("Stackable")}</dt>
                  <dd>{enchantment.is_stackable ? t("Yes") : t("No")}</dd>
                </div>
                {totalCards > 0 && (
                  <div className="frow">
                    <dt>{t("Cards")}</dt>
                    <dd>{totalCards.toLocaleString()}</dd>
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
