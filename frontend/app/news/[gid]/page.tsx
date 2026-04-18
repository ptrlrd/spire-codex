import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import type { NewsArticle } from "@/lib/api";
import { sanitizeSteamNews, newsExcerpt, formatNewsDate } from "@/lib/steam-news";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const revalidate = 1800;

async function fetchItem(gid: string): Promise<NewsArticle | null> {
  try {
    const res = await fetch(`${API}/api/news/${encodeURIComponent(gid)}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as NewsArticle;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gid: string }>;
}): Promise<Metadata> {
  const { gid } = await params;
  const article = await fetchItem(gid);
  if (!article) return { title: `News Not Found | ${SITE_NAME}` };
  const description = newsExcerpt(article.contents ?? "", 200);
  const title = `${article.title} | ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: {
      // Canonical points back to Steam — we're additive, not duplicative.
      canonical: article.url,
    },
    openGraph: {
      title: article.title,
      description,
      url: `${SITE_URL}/news/${gid}`,
      siteName: SITE_NAME,
      type: "article",
      publishedTime: new Date(article.date * 1000).toISOString(),
      authors: article.author ? [article.author] : undefined,
    },
    twitter: { card: "summary_large_image", title: article.title, description },
  };
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ gid: string }>;
}) {
  const { gid } = await params;
  const article = await fetchItem(gid);
  if (!article) notFound();

  const html = sanitizeSteamNews(article.contents ?? "");
  const date = formatNewsDate(article.date);
  const description = newsExcerpt(article.contents ?? "", 250);
  const publishedIso = new Date(article.date * 1000).toISOString();

  // NewsArticle JSON-LD pointing at the original Steam URL as the
  // canonical mainEntityOfPage so search engines treat us as a mirror,
  // not the source.
  const jsonLd: Record<string, unknown>[] = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "News", href: "/news" },
      { name: article.title, href: `/news/${article.gid}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: article.title,
      description,
      datePublished: publishedIso,
      dateModified: publishedIso,
      author: article.author
        ? { "@type": "Person", name: article.author }
        : { "@type": "Organization", name: article.feedlabel || "Mega Crit" },
      publisher: {
        "@type": "Organization",
        name: "Mega Crit",
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": article.url,
      },
      isBasedOn: article.url,
      url: `${SITE_URL}/news/${article.gid}`,
      inLanguage: "en",
      about: { "@type": "VideoGame", name: "Slay the Spire 2" },
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href="/news"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> Back to News
      </Link>

      <article>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2 leading-tight">
          {article.title}
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-1">
          <time dateTime={publishedIso}>{date}</time>
          {" · "}
          {article.feedlabel}
          {article.author ? ` · ${article.author}` : ""}
          {article.tags?.includes("patchnotes") ? " · Patch Notes" : ""}
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-6">
          From{" "}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--accent-gold)]"
          >
            {article.is_external_url ? "the original publisher" : "Steam"}
          </a>
          {" "}— content © Mega Crit Games / respective publisher. Spire Codex mirrors this
          announcement so it stays searchable after Steam rotates it off the news feed.
        </p>

        <div
          className="news-article prose prose-invert max-w-none text-[var(--text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <p className="mt-8 pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          Read on Steam:{" "}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--accent-gold)] hover:text-white"
          >
            {article.url}
          </a>
        </p>
      </article>
    </div>
  );
}
