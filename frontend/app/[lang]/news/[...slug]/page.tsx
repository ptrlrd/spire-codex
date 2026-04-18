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
import { isValidLang, LANG_GAME_NAME, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

function joinSlug(parts: string[]): string {
  return parts.join("/");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string[] }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return {};
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const newsLabel = t("News", lang);
  const gid = gidFromSlug(joinSlug(slug));
  if (!gid) return { title: `${gameName} ${newsLabel} - ${t("Not Found", lang)} | ${SITE_NAME}` };
  const article = await fetchItem(gid);
  if (!article) return { title: `${gameName} ${newsLabel} - ${t("Not Found", lang)} | ${SITE_NAME}` };
  const excerpt = newsExcerpt(article.contents ?? "", 160);
  const description = `${gameName} ${newsLabel} — ${article.title}. ${excerpt}`.slice(0, 300);
  const title = `${article.title} - ${gameName} ${newsLabel} | ${SITE_NAME}`;
  const canonicalPath = newsSlugForArticle(article.gid, `/${lang}/news`);
  return {
    title,
    description,
    alternates: { canonical: canonicalSteamUrl(article.gid) },
    openGraph: {
      title: article.title,
      description,
      url: `${SITE_URL}${canonicalPath}`,
      siteName: SITE_NAME,
      type: "article",
      publishedTime: new Date(article.date * 1000).toISOString(),
      authors: article.author ? [article.author] : undefined,
      locale: LANG_HREFLANG[lang as LangCode],
    },
    twitter: { card: "summary_large_image", title: article.title, description },
  };
}

export default async function LangNewsArticlePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string[] }>;
}) {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return null;
  const joined = joinSlug(slug);
  const gid = gidFromSlug(joined);
  if (!gid) notFound();

  let decoded = joined;
  try {
    decoded = decodeURIComponent(joined);
  } catch {
    /* keep raw */
  }
  const onCanonicalPath = decoded.startsWith("https://store.steampowered.com/news/app/");
  if (!onCanonicalPath) {
    redirect(newsSlugForArticle(gid, `/${lang}/news`));
  }

  const article = await fetchItem(gid);
  if (!article) notFound();

  const html = sanitizeSteamNews(article.contents ?? "");
  const date = formatNewsDate(article.date);
  const description = newsExcerpt(article.contents ?? "", 250);
  const publishedIso = new Date(article.date * 1000).toISOString();
  const onSitePath = newsSlugForArticle(article.gid, `/${lang}/news`);

  const jsonLd: Record<string, unknown>[] = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("News", lang), href: `/${lang}/news` },
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
      inLanguage: LANG_HREFLANG[lang as LangCode],
      about: { "@type": "VideoGame", name: "Slay the Spire 2" },
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href={`/${lang}/news`}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to", lang)} {t("News", lang)}
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
          {article.tags?.includes("patchnotes") ? ` · ${t("Patch Notes", lang)}` : ""}
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-6">{t("news_attribution", lang)}</p>

        <div
          className="news-article prose prose-invert max-w-none text-[var(--text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <p className="mt-8 pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          {t("Read on Steam", lang)}:{" "}
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
