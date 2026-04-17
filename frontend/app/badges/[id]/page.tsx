import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";
import type { Badge } from "@/lib/api";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const STATIC_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

const RARITY_LABEL: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

const RARITY_TINT: Record<string, string> = {
  bronze: "text-[#c5894a] border-[#a87a3d]",
  silver: "text-[#cfd6e0] border-[#9ca6b4]",
  gold: "text-[var(--accent-gold)] border-[var(--accent-gold)]",
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
  const title = `Slay the Spire 2 Badge - ${badge.name} | Spire Codex`;
  const metaDesc = `${badge.name} run-end badge in Slay the Spire 2: ${desc}`;
  return {
    title,
    description: metaDesc,
    openGraph: { title, description: metaDesc },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/badges/${id}` },
  };
}

export default async function BadgePage({ params }: Props) {
  const { id } = await params;
  const badge = await fetchBadge(id);
  if (!badge) notFound();

  const jsonLd = buildDetailPageJsonLd({
    name: `Slay the Spire 2 Badge - ${badge.name}`,
    description: stripTags(badge.description),
    path: `/badges/${id}`,
    category: "Badge",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "Badges", href: "/badges" },
      { name: badge.name, href: `/badges/${id}` },
    ],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href="/badges"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-4"
      >
        ← All badges
      </Link>

      <header className="flex gap-6 items-start mb-8">
        {badge.image_url && (
          <img
            src={`${STATIC_BASE}${badge.image_url}`}
            alt={`Slay the Spire 2 ${badge.name} badge`}
            className="w-28 h-28 object-contain shrink-0"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            {badge.name}
          </h1>
          <p className="text-[var(--text-secondary)] mb-3">
            <RichDescription text={badge.description} />
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {badge.tiered && (
              <span className="px-2 py-1 rounded-full border border-[var(--border-subtle)]">
                Tiered ({badge.tiers.length})
              </span>
            )}
            {badge.requires_win && (
              <span className="px-2 py-1 rounded-full border border-[var(--border-subtle)]">
                Requires win
              </span>
            )}
            {badge.multiplayer_only && (
              <span className="px-2 py-1 rounded-full border border-[var(--border-subtle)] text-[var(--accent-gold)]">
                Multiplayer only
              </span>
            )}
          </div>
        </div>
      </header>

      {badge.tiered && (
        <section>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">
            Tiers
          </h2>
          <div className="space-y-3">
            {badge.tiers.map((t) => (
              <div
                key={t.rarity}
                className={`bg-[var(--bg-card)] rounded-xl border-l-4 ${RARITY_TINT[t.rarity] ?? ""} border-y border-r border-[var(--border-subtle)] p-5`}
              >
                <div className="flex items-baseline gap-3 mb-2">
                  <span
                    className={`text-xs uppercase tracking-wider font-semibold ${RARITY_TINT[t.rarity]?.split(" ")[0] ?? ""}`}
                  >
                    {RARITY_LABEL[t.rarity] ?? t.rarity}
                  </span>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {t.title}
                  </h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  <RichDescription text={t.description} />
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
