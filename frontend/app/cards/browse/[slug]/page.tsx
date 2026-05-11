import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { SLUG_MAP } from "../slug-map";
import BrowseDetail from "./BrowseDetail";

export const dynamic = "force-dynamic";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = SLUG_MAP[slug];
  if (!entry) {
    return { title: "Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
  }

  const title = `${entry.label} - Browse Cards - Slay the Spire 2 (sts2) | Spire Codex`;
  const description = entry.description;

  return {
    title,
    description,
    openGraph: {
      title: `${entry.label} - Slay the Spire 2 (sts2) | Spire Codex`,
      description,
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/cards/browse/${slug}`, languages: buildLanguageAlternates(`/cards/browse/${slug}`) },
  };
}

async function fetchFilteredCards(
  filterParams: Record<string, string>
): Promise<Card[]> {
  try {
    const params = new URLSearchParams(filterParams);
    params.set("lang", "eng");
    const res = await fetch(`${API}/api/cards?${params}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function BrowsePage({ params }: Props) {
  const { slug } = await params;
  const entry = SLUG_MAP[slug];

  if (!entry) {
    notFound();
  }

  const cards = await fetchFilteredCards(entry.params);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Cards", href: "/cards" },
      { name: "Browse", href: "/cards/browse" },
      { name: entry.label, href: `/cards/browse/${slug}` },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 ${entry.label}`,
      description: entry.description,
      path: `/cards/browse/${slug}`,
      items: cards.map((c) => ({
        name: c.name,
        path: `/cards/${c.id.toLowerCase()}`,
      })),
    }),
  ];

  // Build the active filter summary for the subtitle
  const filterParts: string[] = [];
  if (entry.params.rarity) filterParts.push(entry.params.rarity);
  if (entry.params.type) filterParts.push(entry.params.type);
  if (entry.params.color)
    filterParts.push(
      entry.params.color.charAt(0).toUpperCase() + entry.params.color.slice(1)
    );
  if (entry.params.keyword) filterParts.push(entry.params.keyword);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      {/* Breadcrumb navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-4">
        <Link href="/cards" className="hover:text-[var(--accent-gold)] transition-colors">
          Cards
        </Link>
        <span>/</span>
        <Link
          href="/cards/browse"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          Browse
        </Link>
        <span>/</span>
        <span className="text-[var(--text-secondary)]">{entry.label}</span>
      </nav>

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">
          Slay the Spire 2 {entry.label}
        </span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {entry.description}{" "}
        {cards.length > 0 && (
          <span className="text-[var(--text-secondary)]">
            ({cards.length} card{cards.length !== 1 ? "s" : ""} found)
          </span>
        )}
      </p>

      {/* Active filter badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filterParts.map((part) => (
          <span
            key={part}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20"
          >
            {part}
          </span>
        ))}
      </div>

      <BrowseDetail initialCards={cards} fixedParams={entry.params} />
    </div>
  );
}
