import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "@/lib/seo";
import CodexMarkdown from "@/app/components/CodexMarkdown";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const revalidate = 300;

interface CodexEntry {
  id: string;
  title: string;
  date: string;
  body: string;
  href: string;
}

async function loadEntry(slug: string): Promise<CodexEntry | null> {
  try {
    const res = await fetch(`${API}/api/news/codex/${slug}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as CodexEntry;
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await loadEntry(slug);
  if (!entry) return { title: `News | ${SITE_NAME}` };
  const title = `${entry.title} | ${SITE_NAME}`;
  return {
    title,
    description: entry.body.slice(0, 200).replace(/[#*_>`]/g, "").trim(),
    alternates: { canonical: `${SITE_URL}/news/codex/${slug}` },
    openGraph: {
      title,
      type: "article",
      siteName: SITE_NAME,
      url: `${SITE_URL}/news/codex/${slug}`,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
  };
}

export default async function CodexNewsEntryPage({ params }: Props) {
  const { slug } = await params;
  const entry = await loadEntry(slug);
  if (!entry) notFound();

  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "News", href: "/news" },
    { name: entry.title, href: `/news/codex/${slug}` },
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link href="/news?tab=codex" className="text-sm text-[var(--accent-gold)] hover:underline">
        ← All Spire Codex news
      </Link>
      <h1 className="text-3xl font-bold mt-4 mb-1 text-[var(--text-primary)]">{entry.title}</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Spire Codex · {entry.date}
      </p>
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        <CodexMarkdown>{entry.body}</CodexMarkdown>
      </div>
    </div>
  );
}
