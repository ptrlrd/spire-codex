import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata, gameName } from "@/lib/seo";
import type { NewsArticle, NewsListResponse } from "@/lib/api";
import { newsExcerpt, formatNewsDate, newsSlugForArticle } from "@/lib/steam-news";
import { ANNOUNCEMENTS, type Announcement } from "@/lib/announcements";
import MarkAnnouncementsSeen from "./MarkAnnouncementsSeen";

async function loadCodexNews(): Promise<{ items: Announcement[]; latestId: string }> {
  try {
    const res = await fetch(`${API}/api/news/codex`, { next: { revalidate: 300 } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        return { items: data.items as Announcement[], latestId: data.latest_id ?? "" };
      }
    }
  } catch {}
  // Fallback: the committed seed list, until admin-published entries exist.
  return { items: ANNOUNCEMENTS, latestId: ANNOUNCEMENTS[0]?.id ?? "" };
}

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 30min ISR. The on-demand generation pattern means Docker build
// doesn't need backend access, first request after deploy regenerates.
export const revalidate = 1800;


type Tab = "community" | "codex" | "press" | "all";

const TABS: { key: Tab; label: string; sublabel: string; feedType: number | null }[] = [
  { key: "community", label: "Mega Crit", sublabel: "news_tab_community", feedType: 1 },
  { key: "codex", label: "Spire Codex", sublabel: "Site updates & new features", feedType: null },
  { key: "press", label: "Press", sublabel: "news_tab_press", feedType: 0 },
  { key: "all", label: "All", sublabel: "news_tab_all", feedType: null },
];

function tabFromParam(value: string | string[] | undefined): Tab {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "codex" || v === "press" || v === "all") return v;
  return "community";
}

async function loadNews(feedType: number | null): Promise<NewsListResponse> {
  const params = new URLSearchParams({ limit: "200" });
  if (feedType !== null) params.set("feed_type", String(feedType));
  try {
    const res = await fetch(`${API}/api/news?${params}`, { next: { revalidate } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as NewsListResponse;
  } catch {
    return { total: 0, limit: 0, offset: 0, items: [] };
  }
}

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/news", title: t("Patch Notes & Updates"), description: t("news_meta_description") });
}

export default async function NewsPage({ params, searchParams }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const activeTab = tabFromParam(sp.tab);
  const tabConfig = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const isCodex = activeTab === "codex";
  const codex = isCodex ? await loadCodexNews() : { items: [], latestId: "" };
  const data = isCodex
    ? { total: 0, limit: 0, offset: 0, items: [] }
    : await loadNews(tabConfig.feedType);
  const items = data.items;
  const latest = items[0];

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("News"), href: localePath(locale, "/news") },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 News`,
      description: "Patch notes, dev updates, and community announcements.",
      path: localePath(locale, "/news"),
      inLanguage: inLanguageOf(locale),
      items: items.slice(0, 50).map((n) => ({ name: n.title, path: newsSlugForArticle(n.gid) })),
    }),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName(locale)}</span> {t("Patch Notes")} &amp; {t("News")}
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Every Slay the Spire 2 (sts2) patch note, dev update, and announcement from Mega Crit,
        mirrored from Steam the moment it posts, plus press coverage from PCGamesN, RPS, and more.
        {latest ? ` The most recent update is ${latest.title} (${formatNewsDate(latest.date)}).` : ""}
      </p>

      {/* Tabs, Community is the default; Press surfaces external coverage */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
        {TABS.map((tb) => {
          const isActive = tb.key === activeTab;
          const href = tb.key === "community" ? "/news" : `/news?tab=${tb.key}`;
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
              <span>{t(tb.label)}</span>
              <span className="hidden sm:inline text-xs text-[var(--text-muted)] ml-2 font-normal">
                {t(tb.sublabel)}
              </span>
            </Link>
          );
        })}
      </div>

      {isCodex ? (
        <>
          <MarkAnnouncementsSeen latestId={codex.latestId} />
          <ul className="space-y-3">
            {codex.items.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.href || `/news/codex/${a.id}`}
                  className="block bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:border-[var(--border-accent)] transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{a.title}</h2>
                    <time className="text-xs text-[var(--text-muted)] shrink-0">{a.date}</time>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-2">Spire Codex</p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {newsExcerpt(a.body, 220)}
                  </p>
                  <span className="inline-block mt-3 text-sm text-[var(--accent-gold)]">
                    {a.href ? "Check it out →" : "Read more →"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : items.length === 0 ? (
        <p className="text-[var(--text-muted)]">{t("news_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <NewsRow key={n.gid} article={n} basePath="/news" />
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--text-muted)] mt-8">
        Article content © Mega Crit Games (Steam Community Announcements) and the respective
        publishers. Spire Codex mirrors and archives this feed for searchability, original
        links are preserved on every post.
      </p>
    </div>
  );
}

export function NewsRow({ article, basePath }: { article: NewsArticle; basePath: string }) {
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
          {isPatchNotes ? " · Patch Notes" : ""}
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
