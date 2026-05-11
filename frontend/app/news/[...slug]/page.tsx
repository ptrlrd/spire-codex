import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import type { NewsArticle } from "@/lib/api";
import {
  sanitizeSteamNews,
  newsExcerpt,
  formatNewsDate,
  gidFromSlug,
  newsSlugForArticle,
  canonicalSteamUrl,
} from "@/lib/steam-news";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Skip the build-time prerender — CI doesn't have the backend so it would
// 404 every article and bake those 404s into the image.
export const dynamic = "force-dynamic";
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

/** The slug catchall accepts a few shapes:
 *
 *   - `/news/{gid}`                   — current canonical shape, clean
 *     and shareable
 *   - `/news/{encoded canonical url}` — older encoded-URL form, kept so
 *     prior inbound links and search results still resolve
 *
 * Either way we pull the gid out, look up the archived article, and (if
 * the request came in on the encoded-URL form) 308-redirect to the bare
 * gid so search engines and shares converge on one canonical address.
 */
function joinSlug(parts: string[]): string {
  // Next.js splits the catchall on `/`. Bare gids are a single segment;
  // the older encoded-URL form was also a single segment. Steam URLs
  // occasionally leak through unencoded as multiple segments — rejoin
  // defensively so `gidFromSlug()` can still pull the trailing digits.
  return parts.join("/");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const joined = joinSlug(slug);
  const gid = gidFromSlug(joined);
  if (!gid) return { title: `News - Not Found - Slay the Spire 2 (sts2) | ${SITE_NAME}` };
  const article = await fetchItem(gid);
  if (!article) return { title: `News - Not Found - Slay the Spire 2 (sts2) | ${SITE_NAME}` };
  // Lead the meta description with Spire Codex framing so search snippets
  // identify the page as our archive of the Steam announcement, not just
  // the raw article body.
  const excerpt = newsExcerpt(article.contents ?? "", 160);
  const description = `Slay the Spire 2 news on Spire Codex — ${article.title}. ${excerpt}`.slice(0, 300);
  const title = `${article.title} - Slay the Spire 2 News | ${SITE_NAME}`;
  const canonicalPath = newsSlugForArticle(article.gid);
  return {
    title,
    description,
    alternates: {
      // External canonical → Steam, so search engines treat us as a mirror.
      canonical: canonicalSteamUrl(article.gid),
    },
    openGraph: {
      title: article.title,
      description,
      url: `${SITE_URL}${canonicalPath}`,
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
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const joined = joinSlug(slug);
  const gid = gidFromSlug(joined);
  if (!gid) notFound();

  // The canonical shape is `/news/{gid}` — clean, shareable, and stable.
  // If the caller used the older encoded-URL form (or anything else that
  // happened to contain the gid), 308-redirect to the bare-gid path so
  // every flavour of inbound link converges on the canonical address.
  if (joined !== gid) {
    redirect(newsSlugForArticle(gid));
  }

  const article = await fetchItem(gid);
  if (!article) notFound();

  const html = sanitizeSteamNews(article.contents ?? "");
  const date = formatNewsDate(article.date);
  const description = newsExcerpt(article.contents ?? "", 250);
  const publishedIso = new Date(article.date * 1000).toISOString();
  const onSitePath = newsSlugForArticle(article.gid);

  const jsonLd: Record<string, unknown>[] = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "News", href: "/news" },
      { name: article.title, href: onSitePath },
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
      publisher: { "@type": "Organization", name: "Mega Crit" },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalSteamUrl(article.gid) },
      isBasedOn: article.url,
      url: `${SITE_URL}${onSitePath}`,
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
            href={canonicalSteamUrl(article.gid)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--accent-gold)] hover:text-white"
          >
            {canonicalSteamUrl(article.gid)}
          </a>
        </p>
      </article>
    </div>
  );
}
