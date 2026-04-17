import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";
import type { Badge } from "@/lib/api";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Inline <img> src — relative path in prod (NEXT_PUBLIC_API_URL is "") so the
// browser hits the same origin. ?? (not ||) is critical: with || an empty
// string falls through to the localhost fallback in production.
const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// OG / JSON-LD images need ABSOLUTE URLs (social crawlers don't resolve
// relative paths), so prefer NEXT_PUBLIC_SITE_URL — which is set to
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

const RARITY_TEXT: Record<string, string> = {
  bronze: "text-[#c5894a]",
  silver: "text-[#cfd6e0]",
  gold: "text-[var(--accent-gold)]",
};

const RARITY_BORDER: Record<string, string> = {
  bronze: "border-l-[#a87a3d]",
  silver: "border-l-[#9ca6b4]",
  gold: "border-l-[var(--accent-gold)]",
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
  if (!badge) return { title: "Badge Not Found - Spire Codex" };

  const desc = stripTags(badge.description);
  const subtype = badge.tiered ? "Tiered" : "Badge";
  const title = `Slay the Spire 2 Badge - ${badge.name} - ${subtype} | Spire Codex`;
  const metaDesc = `${badge.name} run-end badge in Slay the Spire 2: ${desc}`;
  return {
    title,
    description: metaDesc,
    openGraph: {
      title,
      description: metaDesc,
      images: badge.image_url
        ? [{ url: `${ABSOLUTE_BASE}${badge.image_url}` }]
        : [],
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/badges/${id}` },
  };
}

export default async function BadgePage({ params }: Props) {
  const { id } = await params;
  const badge = await fetchBadge(id);
  if (!badge) notFound();

  const desc = stripTags(badge.description);
  const detailJsonLd = buildDetailPageJsonLd({
    name: badge.name,
    description: desc || `${badge.name} run-end badge from Slay the Spire 2`,
    path: `/badges/${id}`,
    imageUrl: badge.image_url ? `${ABSOLUTE_BASE}${badge.image_url}` : undefined,
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
        ? `Yes — ${badge.name} has ${badge.tiers.length} tiers (${badge.tiers.map((t) => RARITY_LABEL[t.rarity] ?? t.rarity).join(", ")}).`
        : `No — ${badge.name} has a single tier.`,
    },
    {
      question: `Can ${badge.name} be earned in single-player?`,
      answer: badge.multiplayer_only
        ? `No — ${badge.name} is only earnable in multiplayer runs.`
        : `Yes — ${badge.name} can be earned in both single-player and multiplayer.`,
    },
  ];

  const jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href="/badges"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Badges
      </Link>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {badge.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${STATIC_BASE}${badge.image_url}`}
              alt={`Slay the Spire 2 ${badge.name} badge`}
              className="w-24 h-24 object-contain"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-3">
          {badge.name}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-5 text-sm flex-wrap">
          {badge.tiered ? (
            <span className="text-[var(--text-muted)]">
              {badge.tiers.length} tiers
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Single tier</span>
          )}
          {badge.requires_win && (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[var(--text-muted)]">Requires win</span>
            </>
          )}
          {badge.multiplayer_only && (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[var(--accent-gold)]">Multiplayer only</span>
            </>
          )}
        </div>

        <div className="text-[var(--text-secondary)] leading-relaxed text-center mb-6">
          <RichDescription text={badge.description} />
        </div>

        {badge.tiered && (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Tiers
            </h2>
            <div className="space-y-3">
              {badge.tiers.map((t) => (
                <div
                  key={t.rarity}
                  className={`rounded-lg border-l-4 ${RARITY_BORDER[t.rarity] ?? "border-l-[var(--border-subtle)]"} border-y border-r border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4`}
                >
                  <div className="flex items-baseline gap-3 mb-1">
                    <span
                      className={`text-xs uppercase tracking-wider font-semibold ${RARITY_TEXT[t.rarity] ?? ""}`}
                    >
                      {RARITY_LABEL[t.rarity] ?? t.rarity}
                    </span>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      {t.title}
                    </h3>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-snug">
                    <RichDescription text={t.description} />
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
