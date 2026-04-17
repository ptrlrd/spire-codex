import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import {
  buildBreadcrumbJsonLd,
  buildCollectionPageJsonLd,
} from "@/lib/jsonld";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import type { Badge } from "@/lib/api";

export const dynamic = "force-dynamic";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP_TIER_BORDER: Record<string, string> = {
  bronze: "border-[#a87a3d]",
  silver: "border-[#9ca6b4]",
  gold: "border-[var(--accent-gold)]",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${gameName} ${t("Badges", lang)} | Spire Codex (${nativeName})`;
  const description = `${gameName} ${t("Badges", lang)} — ${t("badges_tagline", lang)}`;

  const languages: Record<string, string> = {
    en: `${SITE_URL}/badges`,
    "x-default": `${SITE_URL}/badges`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/badges`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: LANG_HREFLANG[langCode],
    },
    alternates: {
      canonical: `/${lang}/badges`,
      languages,
    },
  };
}

export default async function LangBadgesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  let badges: Badge[] = [];
  try {
    const res = await fetch(`${API}/api/badges?lang=${lang}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) badges = await res.json();
  } catch {}

  const tiered = badges.filter((b) => b.tiered);
  const single = badges.filter((b) => !b.tiered);
  const multiplayerOnly = badges.filter((b) => b.multiplayer_only);

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Badges", lang), href: `/${lang}/badges` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Badges", lang)}`,
      description: t("badges_tagline", lang),
      path: `/${lang}/badges`,
      items: badges.map((b) => ({
        name: b.name,
        path: `/${lang}/badges/${b.id.toLowerCase()}`,
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">
          {gameName} {t("Badges", lang)}
        </span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("badges_tagline", lang)}
      </p>

      {tiered.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            {t("Tiered Badges", lang)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiered.map((b) => (
              <BadgeCard key={b.id} badge={b} lang={lang} />
            ))}
          </div>
        </section>
      )}

      {single.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            {t("Single-Tier Badges", lang)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {single.map((b) => (
              <BadgeCard key={b.id} badge={b} lang={lang} />
            ))}
          </div>
        </section>
      )}

      {multiplayerOnly.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {t("Multiplayer-Only", lang)}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("multiplayer_only_tagline", lang)}
          </p>
          <div className="flex flex-wrap gap-2">
            {multiplayerOnly.map((b) => (
              <Link
                key={b.id}
                href={`/${lang}/badges/${b.id.toLowerCase()}`}
                className="text-sm px-3 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)] transition-colors"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BadgeCard({ badge, lang }: { badge: Badge; lang: string }) {
  const topTier = badge.tiers[badge.tiers.length - 1] ?? badge.tiers[0];
  const borderClass =
    (badge.tiered && TOP_TIER_BORDER[topTier?.rarity ?? "bronze"]) ||
    "border-[var(--border-subtle)]";
  return (
    <Link
      href={`/${lang}/badges/${badge.id.toLowerCase()}`}
      className={`bg-[var(--bg-card)] rounded-lg border ${borderClass} p-4 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all flex gap-4 group`}
    >
      {badge.image_url && (
        <img
          src={`${STATIC_BASE}${badge.image_url}`}
          alt={`${badge.name} badge`}
          className="w-14 h-14 object-contain shrink-0"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-[var(--accent-gold)] mb-1 truncate">
          {badge.name}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-snug">
          <RichDescription text={badge.description} />
        </p>
        {(badge.tiered || badge.requires_win || badge.multiplayer_only) && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {[
              badge.tiered
                ? `${badge.tiers.length} ${badge.tiers.length === 1 ? t("tier", lang) : t("tiers", lang)}`
                : null,
              badge.requires_win ? t("requires win", lang) : null,
              badge.multiplayer_only ? t("multiplayer only", lang) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
