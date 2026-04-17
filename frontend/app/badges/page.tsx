import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import {
  buildBreadcrumbJsonLd,
  buildCollectionPageJsonLd,
} from "@/lib/jsonld";
import type { Badge } from "@/lib/api";

export const dynamic = "force-dynamic";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Use ?? not || so an empty NEXT_PUBLIC_API_URL (production sets it to "")
// passes through and image src becomes a relative `/static/...` URL — falling
// back on `||` would route prod traffic at http://localhost:8000.
const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP_TIER_BORDER: Record<string, string> = {
  bronze: "border-[#a87a3d]",
  silver: "border-[#9ca6b4]",
  gold: "border-[var(--accent-gold)]",
};

export default async function BadgesPage() {
  let badges: Badge[] = [];
  try {
    const res = await fetch(`${API}/api/badges`, { next: { revalidate: 3600 } });
    if (res.ok) badges = await res.json();
  } catch {}

  const tiered = badges.filter((b) => b.tiered);
  const single = badges.filter((b) => !b.tiered);
  const multiplayerOnly = badges.filter((b) => b.multiplayer_only);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Badges", href: "/badges" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Badges",
      description:
        "All run-end badges in Slay the Spire 2 — Bronze, Silver, and Gold tier mini-achievements awarded on the Game Over screen.",
      path: "/badges",
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
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Badges</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Run-end badges are mini-achievements awarded on the Game Over screen.
        Some have Bronze / Silver / Gold tiers; a handful are only attainable
        in multiplayer. Badges contribute to your Daily Leaderboard score.
      </p>

      {tiered.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Tiered Badges
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
            Single-Tier Badges
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
            Multiplayer-Only
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            These badges can only be earned in multiplayer runs.
          </p>
          <div className="flex flex-wrap gap-2">
            {multiplayerOnly.map((b) => (
              <Link
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

function BadgeCard({ badge }: { badge: Badge }) {
  const topTier = badge.tiers[badge.tiers.length - 1] ?? badge.tiers[0];
  const borderClass =
    (badge.tiered && TOP_TIER_BORDER[topTier?.rarity ?? "bronze"]) ||
    "border-[var(--border-subtle)]";
  return (
    <Link
      href={`/badges/${badge.id.toLowerCase()}`}
      className={`bg-[var(--bg-card)] rounded-lg border ${borderClass} p-4 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all flex gap-4 group`}
    >
      {badge.image_url && (
        <img
          src={`${STATIC_BASE}${badge.image_url}`}
          alt={`Slay the Spire 2 ${badge.name} badge`}
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
                ? `${badge.tiers.length} tier${badge.tiers.length === 1 ? "" : "s"}`
                : null,
              badge.requires_win ? "requires win" : null,
              badge.multiplayer_only ? "multiplayer only" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
