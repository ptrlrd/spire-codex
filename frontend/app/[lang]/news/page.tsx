import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import type { NewsArticle, NewsListResponse } from "@/lib/api";
import { newsExcerpt, formatNewsDate, newsSlugForArticle } from "@/lib/steam-news";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

type Tab = "community" | "press" | "all";

const TABS: { key: Tab; feedType: number | null }[] = [
  { key: "community", feedType: 1 },
  { key: "press", feedType: 0 },
  { key: "all", feedType: null },
];

function tabFromParam(value: string | string[] | undefined): Tab {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "press" || v === "all") return v;
  return "community";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${gameName} ${t("News", lang)} | ${SITE_NAME} (${nativeName})`;
  const description = `${t("news_tagline", lang)} ${nativeName}.`;

  const languages: Record<string, string> = {
    en: `${SITE_URL}/news`,
    "x-default": `${SITE_URL}/news`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/news`;
  }

  return {
    title,
    description,
    openGraph: { title, description, locale: LANG_HREFLANG[langCode], type: "website" },
    alternates: { canonical: `${SITE_URL}/${lang}/news`, languages },
  };
}

async function loadNews(feedType: number | null): Promise<NewsListResponse> {
  const params = new URLSearchParams({ limit: "200" });
  if (feedType !== null) params.set("feed_type", String(feedType));
  try {
    const res = await fetch(`${API}/api/news?${params}`, { next: { revalidate } });
    if (!res.ok) throw new Error();
    return (await res.json()) as NewsListResponse;
  } catch {
    return { total: 0, limit: 0, offset: 0, items: [] };
  }
}

export default async function LangNewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const sp = await searchParams;
  const activeTab = tabFromParam(sp.tab);
  const tabConfig = TABS.find((tb) => tb.key === activeTab) ?? TABS[0];
  const data = await loadNews(tabConfig.feedType);
  const items = data.items;

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("News", lang), href: `/${lang}/news` },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 ${t("News", lang)}`,
      description: t("news_tagline", lang),
      path: `/${lang}/news`,
      items: items
        .slice(0, 50)
        .map((n) => ({ name: n.title, path: newsSlugForArticle(n.gid, `/${lang}/news`) })),
    }),
  ];

  // Localized tab labels — falls back to the English source label if the
  // translation key isn't present yet.
  const tabLabels: Record<Tab, { label: string; sublabel: string }> = {
    community: { label: t("Mega Crit", lang), sublabel: t("news_tab_community", lang) },
    press: { label: t("Press", lang), sublabel: t("news_tab_press", lang) },
    all: { label: t("All", lang), sublabel: t("news_tab_all", lang) },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("News", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{t("news_tagline", lang)}</p>

      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
        {TABS.map((tb) => {
          const isActive = tb.key === activeTab;
          const href =
            tb.key === "community" ? `/${lang}/news` : `/${lang}/news?tab=${tb.key}`;
          return (
            <Link
              key={tb.key}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <span>{tabLabels[tb.key].label}</span>
              <span className="hidden sm:inline text-xs text-[var(--text-muted)] ml-2 font-normal">
                {tabLabels[tb.key].sublabel}
              </span>
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="text-[var(--text-muted)]">{t("news_empty", lang)}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <NewsRow key={n.gid} article={n} basePath={`/${lang}/news`} lang={lang} />
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--text-muted)] mt-8">{t("news_attribution", lang)}</p>
    </div>
  );
}

function NewsRow({
  article,
  basePath,
  lang,
}: {
  article: NewsArticle;
  basePath: string;
  lang: string;
}) {
  const date = formatNewsDate(article.date);
  const excerpt = newsExcerpt(article.contents ?? "", 220);
  const tagBadges = article.tags?.slice(0, 3) ?? [];
  const isPatchNotes = article.tags?.includes("patchnotes");
  return (
    <li>
      <Link
        href={newsSlugForArticle(article.gid, basePath)}
        className="block bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:border-[var(--border-accent)] transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{article.title}</h2>
          <time className="text-xs text-[var(--text-muted)] shrink-0">{date}</time>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-2">
          {article.feedlabel}
          {article.author ? ` · ${article.author}` : ""}
          {isPatchNotes ? ` · ${t("Patch Notes", lang)}` : ""}
        </p>
        {excerpt && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{excerpt}</p>
        )}
        {tagBadges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tagBadges.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}
