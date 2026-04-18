import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import type { NewsArticle, NewsListResponse } from "@/lib/api";
import { newsExcerpt, formatNewsDate, newsSlugForArticle } from "@/lib/steam-news";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Render at request time, not build time. The Docker build container
// can't reach the backend, so a build-time prerender would catch the
// fetch error and bake an empty list into the image.
export const dynamic = "force-dynamic";
export const revalidate = 1800;

export const metadata: Metadata = {
  title: `Slay the Spire 2 News - Patch Notes & Announcements | ${SITE_NAME}`,
  description:
    "Latest Slay the Spire 2 news — patch notes, dev updates, community announcements, and press coverage. Mirrored from Steam with permanent archive.",
  alternates: { canonical: `${SITE_URL}/news` },
  openGraph: {
    title: `Slay the Spire 2 News`,
    description:
      "Patch notes, dev updates, community announcements, and press coverage for Slay the Spire 2.",
    url: `${SITE_URL}/news`,
    siteName: SITE_NAME,
    type: "website",
  },
};

type Tab = "community" | "press" | "all";

const TABS: { key: Tab; label: string; sublabel: string; feedType: number | null }[] = [
  { key: "community", label: "Mega Crit", sublabel: "Steam announcements", feedType: 1 },
  { key: "press", label: "Press", sublabel: "PCGamesN, RPS, GamingOnLinux…", feedType: 0 },
  { key: "all", label: "All", sublabel: "Everything", feedType: null },
];

function tabFromParam(value: string | string[] | undefined): Tab {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "press" || v === "all") return v;
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

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = tabFromParam(sp.tab);
  const tabConfig = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const data = await loadNews(tabConfig.feedType);
  const items = data.items;

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "News", href: "/news" },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 News`,
      description: "Patch notes, dev updates, and community announcements.",
      path: "/news",
      items: items.slice(0, 50).map((n) => ({ name: n.title, path: newsSlugForArticle(n.gid) })),
    }),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">News</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Patch notes, dev updates, and community announcements from Mega Crit, plus press
        coverage. Mirrored from Steam — read each post in full or follow the original link.
      </p>

      {/* Tabs — Community is the default; Press surfaces external coverage */}
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
              <span>{tb.label}</span>
              <span className="hidden sm:inline text-xs text-[var(--text-muted)] ml-2 font-normal">
                {tb.sublabel}
              </span>
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="text-[var(--text-muted)]">No news available right now. Check back soon.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <NewsRow key={n.gid} article={n} basePath="/news" />
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--text-muted)] mt-8">
        Article content © Mega Crit Games (Steam Community Announcements) and the respective
        publishers. Spire Codex mirrors and archives this feed for searchability — original
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
