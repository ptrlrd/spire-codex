import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import RichDescription from "@/app/components/RichDescription";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import type { Badge } from "@/lib/api";
import { imageUrl } from "@/lib/image-url";
import "../../card-revamp.css";
import "../../meta-extra.css";

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

type Props = { params: Promise<{ id: string }> };

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

async function fetchBadge(id: string): Promise<Badge | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/badges/${id}`);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const badge = await fetchBadge(id);
  if (!badge) return { title: "Badge Not Found - Slay the Spire 2 (sts2) | Spire Codex" };

  const desc = stripTagsFlat(badge.description);
  const subtype = badge.tiered ? "Tiered" : "Badge";
  const title = `Badge - ${badge.name} - ${subtype} - Slay the Spire 2 (sts2) | Spire Codex`;
  const metaDesc = clipMetaDescription(
    `Slay the Spire 2 ${subtype.toLowerCase()} run-end badge, ${badge.name}${desc ? `: ${desc}` : ""}`,
  );
  return {
    title,
    description: metaDesc,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: `${SITE_URL}/badges/${id}`,
      title,
      description: metaDesc,
      images: badge.image_url
        ? [{ url: imageUrl(badge.image_url) }]
        : [],
    },
    twitter: { card: "summary_large_image", title, description: metaDesc },
    alternates: { canonical: `/badges/${id}`, languages: buildLanguageAlternates(`/badges/${id}`) },
  };
}

export default async function BadgePage({ params }: Props) {
  const { id } = await params;
  const badge = await fetchBadge(id);
  // Unknown badge ID → 308 back to the badges hub so search engines
  // forward link equity to the parent page instead of dumping it on a
  // 404. `fetchBadge` already returns null on both unreachable-backend
  // *and* 404 responses, but a hot list page is a better landing for
  // either case than a dead end.
  if (!badge) redirectMissingEntity("badges", id);

  const desc = stripTags(badge.description);
  const detailJsonLd = buildDetailPageJsonLd({
    name: badge.name,
    description: desc || `${badge.name} run-end badge from Slay the Spire 2`,
    path: `/badges/${id}`,
    imageUrl: badge.image_url ? imageUrl(badge.image_url) : undefined,
    category: "Badge",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "Badges", href: "/badges" },
      { name: badge.name, href: `/badges/${id}` },
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

  const jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];

  const hasImage = !!badge.image_url;

  return (
    <div className="card-rvmp" style={{ "--spine": "var(--accent-gold)" } as CSSProperties}>
      <JsonLd data={jsonLd} />

      <div className={hasImage ? "cd-top" : "cd-top solo"}>
        <Link href="/badges" className="cd-back">
          &larr; Back to Badges
        </Link>
      </div>

      <div className={hasImage ? "wrap" : "wrap solo"}>
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>Badge</span>
              <span>&middot;</span>
              <span>{badge.tiered ? `${badge.tiers.length} tiers` : "Single tier"}</span>
              {badge.requires_win && (
                <>
                  <span>&middot;</span>
                  <span>Requires win</span>
                </>
              )}
              {badge.multiplayer_only && (
                <>
                  <span>&middot;</span>
                  <span>Multiplayer only</span>
                </>
              )}
            </p>
            <h1>{badge.name}</h1>
          </div>

          {/* Table of contents (static: server-rendered page) */}
          {badge.tiered && (
            <nav className="toc" aria-label="On this page">
              <a href="#description">Description</a>
              <a href="#tiers">Tiers</a>
            </nav>
          )}

          {/* Description */}
          <section id="description">
            <h2>Description</h2>
            <div className="desc-quote">
              <RichDescription text={badge.description} />
            </div>
          </section>

          {/* Tiers */}
          {badge.tiered && (
            <section id="tiers">
              <h2>Tiers</h2>
              {badge.tiers.map((t) => (
                <div
                  key={t.rarity}
                  className="trow"
                  style={{ borderLeftColor: RARITY_COLOR[t.rarity] ?? "var(--border-accent)" }}
                >
                  <div className="tr-head">
                    <span className="tr-rarity" style={{ color: RARITY_COLOR[t.rarity] ?? "var(--text-muted)" }}>
                      {RARITY_LABEL[t.rarity] ?? t.rarity}
                    </span>
                    <span className="tr-title">{t.title}</span>
                  </div>
                  <p className="tr-desc">
                    <RichDescription text={t.description} />
                  </p>
                </div>
              ))}
            </section>
          )}
        </main>

        {hasImage && (
          <aside className="aside">
            <div className="box">
              <img
                src={imageUrl(badge.image_url!)}
                alt={`Slay the Spire 2 ${badge.name} badge`}
                className="meta-icon"
              />
              <div className="facts">
                <div className="fh">At a glance</div>
                <dl>
                  <div className="frow">
                    <dt>Tiers</dt>
                    <dd>{badge.tiered ? badge.tiers.length : "Single"}</dd>
                  </div>
                  <div className="frow">
                    <dt>Requires win</dt>
                    <dd>{badge.requires_win ? "Yes" : "No"}</dd>
                  </div>
                  {badge.multiplayer_only && (
                    <div className="frow">
                      <dt>Multiplayer</dt>
                      <dd style={{ color: "var(--accent-gold)" }}>Only</dd>
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
