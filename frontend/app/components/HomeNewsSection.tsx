import Link from "next/link";
import type { NewsArticle, NewsListResponse } from "@/lib/api";
import {
  firstNewsImage,
  newsExcerpt,
  formatNewsDate,
  newsSlugForArticle,
} from "@/lib/steam-news";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const REVALIDATE = 1800;

// Slay the Spire 2 Steam header — used as a fallback hero for text-only
// announcements (hotfix patch notes etc. that ship with no inline image).
// Sourced from Steam's public store CDN so it stays in sync with whatever
// Mega Crit currently has up.
const STEAM_HEADER_FALLBACK =
  "https://cdn.cloudflare.steamstatic.com/steam/apps/2868840/header.jpg";

/** Pull the latest 3 community announcements (feed_type=1). The list
 * endpoint omits article bodies, so we follow up with per-article fetches
 * to grab the hero image and an excerpt. Three sequential-but-tiny calls
 * fanned out in parallel. */
async function loadLatestCommunityNews(): Promise<NewsArticle[]> {
  try {
    const listRes = await fetch(`${API}/api/news?feed_type=1&limit=3`, {
      next: { revalidate: REVALIDATE },
    });
    if (!listRes.ok) return [];
    const list = (await listRes.json()) as NewsListResponse;
    const stubs = list.items.slice(0, 3);
    const full = await Promise.all(
      stubs.map(async (stub) => {
        try {
          const r = await fetch(`${API}/api/news/${encodeURIComponent(stub.gid)}`, {
            next: { revalidate: REVALIDATE },
          });
          if (!r.ok) return stub;
          return (await r.json()) as NewsArticle;
        } catch {
          return stub;
        }
      }),
    );
    return full;
  } catch {
    return [];
  }
}

export default async function HomeNewsSection({
  langPrefix = "",
  lang = "eng",
}: {
  langPrefix?: string;
  lang?: string;
}) {
  const items = await loadLatestCommunityNews();
  if (items.length === 0) return null;
  const newsBase = `${langPrefix}/news`;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
          {t("home_news_heading_prefix", lang)}{" "}
          <span className="text-[var(--accent-gold)]">Mega Crit</span>
        </h2>
        <Link
          href={newsBase}
          className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
        >
          <span>{t("View more", lang)}</span>
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((article) => {
          const hero = firstNewsImage(article.contents) ?? STEAM_HEADER_FALLBACK;
          const blurb = newsExcerpt(article.contents ?? "", 110);
          const date = formatNewsDate(article.date);
          const href = newsSlugForArticle(article.gid, newsBase);
          return (
            <Link
              key={article.gid}
              href={href}
              className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] aspect-[4/3] hover:border-[var(--border-accent)] hover:shadow-xl hover:shadow-black/30 transition-all"
            >
              <img
                src={hero}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Dark gradient under the text so the title is legible against
                  any hero image. Slightly darker at the bottom where copy sits. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/10" />

              <div className="relative h-full flex flex-col justify-end p-4 sm:p-5">
                <h3 className="text-base sm:text-lg font-semibold text-white leading-tight mb-1 group-hover:text-[var(--accent-gold)] transition-colors line-clamp-2">
                  {article.title}
                </h3>
                {blurb && (
                  <p className="text-xs sm:text-sm text-white/80 leading-snug mb-2 line-clamp-2">
                    {blurb}
                  </p>
                )}
                <time
                  dateTime={new Date(article.date * 1000).toISOString()}
                  className="text-[11px] uppercase tracking-wider text-white/60"
                >
                  {date}
                </time>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
