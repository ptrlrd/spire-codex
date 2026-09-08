import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import {
  buildBreadcrumbJsonLd,
  buildCollectionPageJsonLd,
} from "@/lib/jsonld";
import type { Badge } from "@/lib/api";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-dynamic";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Use ?? not || so an empty NEXT_PUBLIC_API_URL (production sets it to "")
// passes through and image src becomes a relative `/static/...` URL, falling
// back on `||` would route prod traffic at http://localhost:8000.
const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP_TIER_BORDER: Record<string, string> = {
  bronze: "border-bronze",
  silver: "border-silver",
  gold: "border-accent",
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/badges", title: t("Badges"), description: t("badges_meta_description") });
}

export default async function BadgesPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Badges"));
  const tagline = t("badges_tagline");
  let badges: Badge[] = [];
  try {
    const res = await fetch(`${API}/api/badges${langQuery(locale)}`, { next: { revalidate: 3600 } });
    if (res.ok) badges = await res.json();
  } catch {}

  const tiered = badges.filter((b) => b.tiered);
  const single = badges.filter((b) => !b.tiered);
  const multiplayerOnly = badges.filter((b) => b.multiplayer_only);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Badges"), href: localePath(locale, "/badges") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Badges",
      description:
        "All run-end badges in Slay the Spire 2 (sts2), Bronze, Silver, and Gold tier mini-achievements awarded on the Game Over screen.",
      path: localePath(locale, "/badges"),
      inLanguage: inLanguageOf(locale),
      items: badges.map((b) => ({
        name: b.name,
        path: `/badges/${b.id.toLowerCase()}`,
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      {tiered.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            {t("Tiered Badges")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiered.map((b) => (
              <BadgeCard key={b.id} badge={b} />
            ))}
          </div>
        </section>
      )}

      {single.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            {t("Single-Tier Badges")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {single.map((b) => (
              <BadgeCard key={b.id} badge={b} />
            ))}
          </div>
        </section>
      )}

      {multiplayerOnly.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {t("Multiplayer-Only")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("These badges can only be earned in multiplayer runs.")}
          </p>
          <div className="flex flex-wrap gap-2">
            {multiplayerOnly.map((b) => (
              <Link
                prefetch={false}
                key={b.id}
                href={`/badges/${b.id.toLowerCase()}`}
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

async function BadgeCard({ badge }: { badge: Badge }) {
  const t = await getT();
  const topTier = badge.tiers[badge.tiers.length - 1] ?? badge.tiers[0];
  const borderClass =
    (badge.tiered && TOP_TIER_BORDER[topTier?.rarity ?? "bronze"]) ||
    "border-[var(--border-subtle)]";
  return (
    <Link
      prefetch={false}
      href={`/badges/${badge.id.toLowerCase()}`}
      className={`bg-[var(--bg-card)] rounded-lg border ${borderClass} p-4 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all flex gap-4 group`}
    >
      {badge.image_url && (
        <img crossOrigin="anonymous"
          src={imageUrl(badge.image_url)}
          alt={t("Slay the Spire 2 {name} badge", { name: badge.name })}
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
                ? `${badge.tiers.length} ${badge.tiers.length === 1 ? t("tier") : t("tiers")}`
                : null,
              badge.requires_win ? t("requires win") : null,
              badge.multiplayer_only ? t("multiplayer only") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
