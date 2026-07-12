import Link from "next/link";
import type { NewsArticle, NewsListResponse } from "@/lib/api";
import {
  firstNewsImage,
  newsExcerpt,
  formatNewsDate,
  newsSlugForArticle,
} from "@/lib/steam-news";
import { t } from "@/lib/ui-translations";
import "../home-sections.css";

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const REVALIDATE = 1800;

// Slay the Spire 2 Steam header, used as a fallback hero for text-only
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
    <div className="rvmp">
      <section className="hb">
        <div className="hsec">
          <div className="s-head">
            <h2>
              {t("home_news_heading_prefix", lang)}{" "}
              <span style={{ color: "var(--gold)" }}>Mega Crit</span>
            </h2>
            <Link className="viewmore" href={newsBase}>
              {t("View more", lang)} {ARROW}
            </Link>
          </div>

          <div className="newsrow">
            {items.map((article) => {
              const hero = firstNewsImage(article.contents) ?? STEAM_HEADER_FALLBACK;
              const blurb = newsExcerpt(article.contents ?? "", 110);
              const date = formatNewsDate(article.date);
              const href = newsSlugForArticle(article.gid, newsBase);
              return (
                <Link key={article.gid} href={href} className="news">
                  <img className="news-thumb" src={hero} alt="" loading="lazy" />
                  <span className="news-src">Mega Crit</span>
                  <span className="news-title">{article.title}</span>
                  {blurb && <span className="news-ex">{blurb}</span>}
                  <time className="news-date" dateTime={new Date(article.date * 1000).toISOString()}>
                    {date}
                  </time>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
