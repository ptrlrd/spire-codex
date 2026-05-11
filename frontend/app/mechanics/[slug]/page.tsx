import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL, SITE_NAME, buildLanguageAlternates} from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildDetailPageJsonLd } from "@/lib/jsonld";
import Link from "next/link";
import MechanicMarkdown from "./MechanicMarkdown";
import type { MechanicSectionMeta } from "../page";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

interface MechanicSectionDetail extends MechanicSectionMeta {
  body_markdown: string;
}

async function fetchSection(slug: string): Promise<MechanicSectionDetail | null> {
  // Tolerates ECONNREFUSED so the Docker frontend build doesn't fail when
  // the backend container isn't running yet. Pages are rendered on demand
  // post-deploy with the `revalidate` cache below — same pattern as every
  // other entity detail page (cards, relics, monsters, etc.) which never
  // had generateStaticParams in the first place.
  try {
    const res = await fetch(`${API_INTERNAL}/api/mechanics/sections/${slug}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as MechanicSectionDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const section = await fetchSection(slug);
  if (!section) return { title: `Not Found - Slay the Spire 2 (sts2) | ${SITE_NAME}` };
  const title = `${section.title} - Slay the Spire 2 | ${SITE_NAME}`;
  return {
    title,
    description: section.description,
    alternates: { canonical: `${SITE_URL}/mechanics/${slug}` },
    openGraph: { title, description: section.description, url: `${SITE_URL}/mechanics/${slug}`, siteName: SITE_NAME, type: "article" },
    twitter: { card: "summary", title, description: section.description },
  };
}

export default async function MechanicDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = await fetchSection(slug);
  if (!section) notFound();

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Mechanics", href: "/mechanics" },
      { name: section.title, href: `/mechanics/${slug}` },
    ]),
    ...buildDetailPageJsonLd({
      name: `${section.title} - Slay the Spire 2`,
      description: section.description,
      path: `/mechanics/${slug}`,
      category: section.category === "secrets" ? "Secrets & Trivia" : "Game Mechanics",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Mechanics", href: "/mechanics" },
        { name: section.title, href: `/mechanics/${slug}` },
      ],
    }),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link
        href="/mechanics"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> Back to Mechanics
      </Link>
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{section.title}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">{section.description}</p>
      <MechanicMarkdown body={section.body_markdown} />
    </div>
  );
}
