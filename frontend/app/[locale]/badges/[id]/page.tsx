import { getT } from "@/lib/i18n-server";
import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, type Locale } from "@/lib/locale";
import { entityFallbackDescription } from "@/lib/locale-server";
import type { CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import RichDescription from "@/app/components/RichDescription";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import type { Badge } from "@/lib/api";
import { imageUrl } from "@/lib/image-url";
import "@/app/card-revamp.css";
import "@/app/meta-extra.css";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Inline <img> src, relative path in prod (NEXT_PUBLIC_API_URL is "") so the
// browser hits the same origin. ?? (not ||) is critical: with || an empty
// string falls through to the localhost fallback in production.
const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// OG / JSON-LD images need ABSOLUTE URLs (social crawlers don't resolve
// relative paths), so prefer NEXT_PUBLIC_SITE_URL, which is set to
// https://spire-codex.com in prod CI.
const ABSOLUTE_BASE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

const RARITY_LABEL: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

const RARITY_COLOR: Record<string, string> = {
  bronze: "#c5894a",
  silver: "#cfd6e0",
  gold: "var(--accent-gold)",
};

async function fetchBadge(id: string, locale: Locale): Promise<Badge | null> {
  const res = await fetchEntityRes(`${API_INTERNAL}/api/badges/${id}${langQuery(locale)}`);
  return res.ok ? await res.json() : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/badges/${id}`;
  const badge = await fetchBadge(id, locale);
  if (!badge) return buildPageMetadata({ locale, path, title: t("Badge Not Found"), noIndex: true });

  const desc = stripTagsFlat(badge.description);
  const subtype = badge.tiered ? "tiered" : "badge";
  return buildPageMetadata({
    locale,
    path,
    title: `${badge.name} - ${t("Badge")}`,
    description: clipMetaDescription(t("badge_meta_description", { name: badge.name, subtype, desc: desc || "none" })),
    ogType: "article",
    image: badge.image_url ? imageUrl(badge.image_url) : undefined,
  });
}

export default async function BadgePage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const badge = await fetchBadge(id, locale);
  if (!badge) redirectMissingEntity("badges", id, locale);

  const desc = stripTags(badge.description);
  const detailJsonLd = buildDetailPageJsonLd({
    name: badge.name,
    description: desc || entityFallbackDescription(locale, badge.name, "badge"),
    path: localePath(locale, `/badges/${id}`),
    imageUrl: badge.image_url ? imageUrl(badge.image_url) : undefined,
    category: "Badge",
        inLanguage: inLanguageOf(locale),
    breadcrumbs: [
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Badges"), href: localePath(locale, "/badges") },
      { name: badge.name, href: localePath(locale, `/badges/${id}`) },
    ],
  });

  const faqQuestions = [
    {
      question: `How do you earn the ${badge.name} badge in Slay the Spire 2?`,
      answer: desc || `${badge.name} is a run-end badge in Slay the Spire 2.`,
    },
    {
      question: `Is ${badge.name} a tiered badge?`,
      answer: badge.tiered
        ? `Yes, ${badge.name} has ${badge.tiers.length} tiers (${badge.tiers.map((t) => RARITY_LABEL[t.rarity] ?? t.rarity).join(", ")}).`
        : `No, ${badge.name} has a single tier.`,
    },
    {
      question: `Can ${badge.name} be earned in single-player?`,
      answer: badge.multiplayer_only
        ? `No, ${badge.name} is only earnable in multiplayer runs.`
        : `Yes, ${badge.name} can be earned in both single-player and multiplayer.`,
    },
  ];

  const jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;

  const hasImage = !!badge.image_url;

  return (
    <div className="card-rvmp" style={{ "--spine": "var(--accent-gold)" } as CSSProperties}>
      <JsonLd data={jsonLd} />

      <div className={hasImage ? "cd-top" : "cd-top solo"}>
        <Link href="/badges" className="cd-back">
          &larr; {t("Back to")} {t("Badges")}
        </Link>
      </div>

      <div className={hasImage ? "wrap" : "wrap solo"}>
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Badge")}</span>
              <span>&middot;</span>
              <span>{badge.tiered ? `${badge.tiers.length} ${t("tiers")}` : t("Single tier")}</span>
              {badge.requires_win && (
                <>
                  <span>&middot;</span>
                  <span>{t("Requires win")}</span>
                </>
              )}
              {badge.multiplayer_only && (
                <>
                  <span>&middot;</span>
                  <span>{t("Multiplayer only")}</span>
                </>
              )}
            </p>
            <h1>{badge.name}</h1>
          </div>

          {/* Table of contents (static: server-rendered page) */}
          {badge.tiered && (
            <nav className="toc" aria-label={t("On this page")}>
              <span className="toc-label">{t("On this page")}</span>
              <a href="#description">{t("Description")}</a>
              <a href="#tiers">{t("Tiers")}</a>
            </nav>
          )}

          {/* Description */}
          <section id="description">
            <h2>{t("Description")}</h2>
            <div className="desc-quote">
              <RichDescription text={badge.description} />
            </div>
          </section>

          {/* Tiers */}
          {badge.tiered && (
            <section id="tiers">
              <h2>{t("Tiers")}</h2>
              {badge.tiers.map((tier) => (
                <div
                  key={tier.rarity}
                  className="trow"
                  style={{ borderLeftColor: RARITY_COLOR[tier.rarity] ?? "var(--border-accent)" }}
                >
                  <div className="tr-head">
                    <span className="tr-rarity" style={{ color: RARITY_COLOR[tier.rarity] ?? "var(--text-muted)" }}>
                      {t(RARITY_LABEL[tier.rarity] ?? tier.rarity)}
                    </span>
                    <span className="tr-title">{tier.title}</span>
                  </div>
                  <p className="tr-desc">
                    <RichDescription text={tier.description} />
                  </p>
                </div>
              ))}
            </section>
          )}
        </main>

        {hasImage && (
          <aside className="aside">
            <div className="box">
              <img crossOrigin="anonymous"
                src={imageUrl(badge.image_url!)}
                alt={t("Slay the Spire 2 {name} badge", { name: badge.name })}
                className="meta-icon"
              />
              <div className="facts">
                <div className="fh">{t("At a glance")}</div>
                <dl>
                  <div className="frow">
                    <dt>{t("Tiers")}</dt>
                    <dd>{badge.tiered ? badge.tiers.length : t("Single")}</dd>
                  </div>
                  <div className="frow">
                    <dt>{t("Requires win")}</dt>
                    <dd>{badge.requires_win ? t("Yes") : t("No")}</dd>
                  </div>
                  {badge.multiplayer_only && (
                    <div className="frow">
                      <dt>{t("Multiplayer")}</dt>
                      <dd style={{ color: "var(--accent-gold)" }}>{t("Only")}</dd>
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
