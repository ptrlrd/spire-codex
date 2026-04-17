import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildCollectionPageJsonLd } from "@/lib/jsonld";
import type { Badge } from "@/lib/api";

export const dynamic = "force-dynamic";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const RARITY_BORDER: Record<string, string> = {
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

  const single = badges.filter((b) => !b.tiered);
  const tiered = badges.filter((b) => b.tiered);
  const multiplayerOnly = badges.filter((b) => b.multiplayer_only);

  const jsonLd = buildCollectionPageJsonLd({
    name: "Slay the Spire 2 Badges - Run-End Awards | Spire Codex",
    description:
      "All run-end badges in Slay the Spire 2 — mini-achievements awarded on the Game Over screen. Bronze, Silver, and Gold tiers.",
    path: "/badges",
    items: badges.map((b) => ({
      name: b.name,
      path: `/badges/${b.id.toLowerCase()}`,
    })),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Badges
      </h1>
      <p className="text-[var(--text-secondary)] mb-8 max-w-3xl">
        Run-end badges are mini-achievements awarded on the Game Over screen.
        Some have Bronze / Silver / Gold tiers; a handful are only attainable
        in multiplayer. Badges contribute to your Daily Leaderboard score.
      </p>

      {tiered.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">
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
        <section className="mb-12">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">
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
        <section className="mb-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Multiplayer-Only
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            These badges can only be earned in multiplayer runs.
          </p>
          <div className="flex flex-wrap gap-2">
            {multiplayerOnly.map((b) => (
              <Link
                key={b.id}
                href={`/badges/${b.id.toLowerCase()}`}
                className="text-sm px-3 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)]"
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
  const borderClass = RARITY_BORDER[topTier?.rarity ?? "bronze"];
  return (
    <Link
      href={`/badges/${badge.id.toLowerCase()}`}
      className={`bg-[var(--bg-card)] rounded-xl border ${borderClass} p-5 hover:bg-[var(--bg-card-hover)] transition-all flex gap-4`}
    >
      {badge.image_url && (
        <img
          src={`${STATIC_BASE}${badge.image_url}`}
          alt={`Slay the Spire 2 ${badge.name} badge`}
          className="w-16 h-16 object-contain shrink-0"
          loading="lazy"
        />
      )}
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-[var(--accent-gold)] mb-1 truncate">
          {badge.name}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-snug">
          <RichDescription text={badge.description} />
        </p>
        {badge.tiered && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {badge.tiers.length} tier{badge.tiers.length === 1 ? "" : "s"}
            {badge.requires_win ? " · requires win" : ""}
            {badge.multiplayer_only ? " · multiplayer only" : ""}
          </p>
        )}
        {!badge.tiered && (badge.requires_win || badge.multiplayer_only) && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {badge.requires_win ? "Requires win" : ""}
            {badge.requires_win && badge.multiplayer_only ? " · " : ""}
            {badge.multiplayer_only ? "Multiplayer only" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}
