import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, SITE_URL } from "@/lib/seo";
import {
  isValidLang,
  LANG_HREFLANG,
  LANG_NAMES,
  LANG_GAME_NAME,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import type { Badge } from "@/lib/api";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ABSOLUTE_BASE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

const RARITY_KEY: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold tier",
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

async function fetchBadge(id: string, lang: string): Promise<Badge | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/badges/${id}?lang=${lang}`);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};

  const badge = await fetchBadge(id, lang);
  if (!badge) return { title: "Badge Not Found - Spire Codex" };

  const desc = stripTags(badge.description);
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${gameName} ${t("Badges", lang)} - ${badge.name} | Spire Codex (${nativeName})`;
  const metaDesc = `${badge.name} — ${desc}`;

  const languages: Record<string, string> = {
    en: `${SITE_URL}/badges/${id}`,
    "x-default": `${SITE_URL}/badges/${id}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/badges/${id}`;
  }

  return {
    title,
    description: metaDesc,
    openGraph: {
      title,
      description: metaDesc,
      images: badge.image_url
        ? [{ url: `${ABSOLUTE_BASE}${badge.image_url}` }]
        : [],
      locale: LANG_HREFLANG[langCode],
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/${lang}/badges/${id}`, languages },
  };
}

export default async function LangBadgePage({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;

  const badge = await fetchBadge(id, lang);
  if (!badge) notFound();

  const desc = stripTags(badge.description);
  const detailJsonLd = buildDetailPageJsonLd({
    name: badge.name,
    description: desc || `${badge.name}`,
    path: `/${lang}/badges/${id}`,
    imageUrl: badge.image_url ? `${ABSOLUTE_BASE}${badge.image_url}` : undefined,
    category: "Badge",
    breadcrumbs: [
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Badges", lang), href: `/${lang}/badges` },
      { name: badge.name, href: `/${lang}/badges/${id}` },
    ],
  });

  const faqQuestions = [
    {
      question: `${badge.name}?`,
      answer: desc || badge.name,
    },
  ];

  const jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href={`/${lang}/badges`}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Badges", lang)}
      </Link>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {badge.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${STATIC_BASE}${badge.image_url}`}
              alt={`${badge.name} badge`}
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
              {badge.tiers.length} {t("tiers", lang)}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">
              {t("Single tier", lang)}
            </span>
          )}
          {badge.requires_win && (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[var(--text-muted)]">
                {t("Requires win", lang)}
              </span>
            </>
          )}
          {badge.multiplayer_only && (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[var(--accent-gold)]">
                {t("Multiplayer only", lang)}
              </span>
            </>
          )}
        </div>

        <div className="text-[var(--text-secondary)] leading-relaxed text-center mb-6">
          <RichDescription text={badge.description} />
        </div>

        {badge.tiered && (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              {t("Tiers", lang)}
            </h2>
            <div className="space-y-3">
              {badge.tiers.map((tier) => {
                const tierKey = RARITY_KEY[tier.rarity] ?? tier.rarity;
                return (
                  <div
                    key={tier.rarity}
                    className={`rounded-lg border-l-4 ${RARITY_BORDER[tier.rarity] ?? "border-l-[var(--border-subtle)]"} border-y border-r border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4`}
                  >
                    <div className="flex items-baseline gap-3 mb-1">
                      <span
                        className={`text-xs uppercase tracking-wider font-semibold ${RARITY_TEXT[tier.rarity] ?? ""}`}
                      >
                        {t(tierKey, lang)}
                      </span>
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        {tier.title}
                      </h3>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-snug">
                      <RichDescription text={tier.description} />
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
