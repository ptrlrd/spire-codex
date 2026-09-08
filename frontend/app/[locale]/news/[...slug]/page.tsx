import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound, permanentRedirect } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildNewsArticleJsonLd } from "@/lib/jsonld";
import { buildPageMetadata, clipMetaDescription, pageHeading } from "@/lib/seo";
import type { NewsArticle } from "@/lib/api";
import { getT } from "@/lib/i18n-server";
import { localeOf, localePath } from "@/lib/locale";
import {
  sanitizeSteamNews,
  newsExcerpt,
  formatNewsDate,
  gidFromSlug,
  newsSlugForArticle,
  canonicalSteamUrl,
  firstNewsImage,
} from "@/lib/steam-news";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Skip the build-time prerender, CI doesn't have the backend so it would
// 404 every article and bake those 404s into the image.
export const dynamic = "force-dynamic";
export const revalidate = 1800;

type Props = { params: Promise<{ locale: string; slug: string[] }> };

async function fetchItem(gid: string): Promise<NewsArticle | null> {
  const res = await fetch(`${API}/api/news/${encodeURIComponent(gid)}`, {
    next: { revalidate },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`news API returned ${res.status}`);
  return (await res.json()) as NewsArticle;
}

/** The slug catchall accepts a few shapes:
 *
 *   - `/news/{gid}`                  , current canonical shape, clean
 *     and shareable
 *   - `/news/{encoded canonical url}`, older encoded-URL form, kept so
 *     prior inbound links and search results still resolve
 *
 * Either way we pull the gid out, look up the archived article, and (if
 * the request came in on the encoded-URL form) 308-redirect to the bare
 * gid so search engines and shares converge on one canonical address.
 */
function joinSlug(parts: string[]): string {
  // Next.js splits the catchall on `/`. Bare gids are a single segment;
  // the older encoded-URL form was also a single segment. Steam URLs
  // occasionally leak through unencoded as multiple segments, rejoin
  // defensively so `gidFromSlug()` can still pull the trailing digits.
  return parts.join("/");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const missing = buildPageMetadata({ locale, path: "/news", title: `${t("News")} - ${t("Not Found")}`, noIndex: true });
  const joined = joinSlug(slug);
  const gid = gidFromSlug(joined);
  if (!gid) return missing;
  const article = await fetchItem(gid);
  if (!article) return missing;
  // Lead the meta description with Spire Codex framing so search snippets
  // identify the page as our archive of the Steam announcement, not just
  // the raw article body.
  const excerpt = newsExcerpt(article.contents ?? "", 160);
  const meta = buildPageMetadata({
    locale,
    path: newsSlugForArticle(article.gid),
    title: `${article.title} - ${t("News")}`,
    description: clipMetaDescription(`${pageHeading(locale, t("News"))}, ${article.title}. ${excerpt}`),
    ogType: "article",
    image: firstNewsImage(article.contents) ?? undefined,
    supressLanguageAlternates: true,
    canonical: canonicalSteamUrl(article.gid),
  });
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      type: "article",
      publishedTime: new Date(article.date * 1000).toISOString(),
      authors: article.author ? [article.author] : undefined,
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const newsIndex = localePath(locale, "/news");
  const joined = joinSlug(slug);
  const gid = gidFromSlug(joined);
  if (!gid) notFound();

  // The canonical shape is `/news/{gid}`, clean, shareable, and stable.
  // If the caller used the older encoded-URL form (or anything else that
  // happened to contain the gid), 308-redirect to the bare-gid path so
  // every flavour of inbound link converges on the canonical address.
  if (joined !== gid) {
    permanentRedirect(localePath(locale, newsSlugForArticle(gid)));
  }

  const article = await fetchItem(gid);
  if (!article) notFound();

  const html = sanitizeSteamNews(article.contents ?? "");
  const date = formatNewsDate(article.date);
  const description = newsExcerpt(article.contents ?? "", 250);
  const publishedIso = new Date(article.date * 1000).toISOString();
  const onSitePath = localePath(locale, newsSlugForArticle(article.gid));

  const jsonLd: Record<string, unknown>[] = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("News"), href: newsIndex },
      { name: article.title, href: onSitePath },
    ]),
    buildNewsArticleJsonLd({
      headline: article.title,
      description,
      datePublished: publishedIso,
      author: article.author ?? null,
      feedlabel: article.feedlabel ?? null,
      externalCanonical: canonicalSteamUrl(article.gid),
      externalUrl: article.url,
      path: onSitePath,
      inLanguage: "en",
      imageUrl: firstNewsImage(article.contents) ?? undefined,
    }),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href="/news"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to")} {t("News")}
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
          {article.tags?.includes("patchnotes") ? ` · ${t("Patch Notes")}` : ""}
        </p>
        {locale === "eng" ? (
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
            {" "}content © Mega Crit Games / respective publisher. Spire Codex mirrors this
            announcement so it stays searchable after Steam rotates it off the news feed.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)] mb-6">{t("news_attribution")}</p>
        )}

        <div
          className="news-article prose prose-invert max-w-none text-[var(--text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <p className="mt-8 pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          {t("Read on Steam")}:{" "}
          <a
            href={canonicalSteamUrl(article.gid)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--accent-gold)] hover:text-on-fill"
          >
            {canonicalSteamUrl(article.gid)}
          </a>
        </p>
      </article>
    </div>
  );
}
