import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "./seo";

interface BreadcrumbItem {
  name: string;
  href: string;
}

// Reused publisher block. Google's structured-data validator wants
// publisher.logo on every Article-family schema (Article, NewsArticle,
// BlogPosting). We use the default-OG asset since it's a public,
// resolvable square image hosted at SITE_URL.
const PUBLISHER_ORG = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: DEFAULT_OG_IMAGE,
  },
};

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.href}`,
    })),
  };
}

export function buildCollectionPageJsonLd({
  name,
  description,
  path,
  items,
  inLanguage,
}: {
  name: string;
  description: string;
  path: string;
  items?: { name: string; path: string }[];
  inLanguage?: string;
}) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${SITE_URL}${path}`,
    inLanguage: inLanguage ?? "en",
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  if (items && items.length > 0) {
    jsonLd.mainEntity = {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.slice(0, 50).map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: `${SITE_URL}${item.path}`,
      })),
    };
  }

  return jsonLd;
}

// Stable site launch date used as the default `datePublished` for
// detail pages. Schema.org Article requires `datePublished`, and
// Google's rich-results validator flags its absence. Per-entity data
// doesn't carry its own publication timestamp (the data is parsed from
// game files, not authored), so we anchor every entity page to the
// codex launch date, accurate for "when did Spire Codex publish a
// page about this entity" and stable across re-renders.
const SITE_LAUNCH_DATE = "2026-01-01T00:00:00.000Z";

export function buildDetailPageJsonLd({
  name,
  description,
  path,
  imageUrl,
  category,
  breadcrumbs,
  datePublished,
  dateModified,
  inLanguage,
}: {
  name: string;
  description: string;
  path: string;
  imageUrl?: string;
  category: string;
  breadcrumbs: BreadcrumbItem[];
  datePublished?: string;
  dateModified?: string;
  inLanguage?: string;
}) {
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: name,
    description,
    url: `${SITE_URL}${path}`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}${path}` },
    datePublished: datePublished ?? SITE_LAUNCH_DATE,
    dateModified: dateModified ?? datePublished ?? SITE_LAUNCH_DATE,
    // Articles require an `author` for Rich Results. The codex pages
    // are compiled by the site rather than authored by a single
    // person, so we attribute to the Spire Codex organization.
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: PUBLISHER_ORG,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    inLanguage: inLanguage ?? "en",
    about: {
      "@type": "Thing",
      name: `Slay the Spire 2 ${category}`,
    },
  };

  // Article requires an image for Rich Results. Fall back to the
  // sitewide OG asset when the entity has no image of its own
  // (acts, ascensions, mechanics, comparisons, etc.).
  article.image = imageUrl ?? DEFAULT_OG_IMAGE;

  return [article, buildBreadcrumbJsonLd(breadcrumbs)];
}

export function buildWebSiteJsonLd() {
  // `potentialAction` exposes the Sitelinks Search Box. Google reads
  // this to wire up a search box directly in the SERP for our domain.
  // The `{search_term_string}` placeholder is required verbatim per
  // schema.org spec, Google substitutes the user's query into it.
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "The complete Slay the Spire 2 database. Browse all cards, relics, characters, monsters, potions, events, powers, and more.",
    publisher: PUBLISHER_ORG,
  };
}

const STEAM_STORE_URL = "https://store.steampowered.com/app/2868840/Slay_the_Spire_2/";

export function buildVideoGameJsonLd(steam?: {
  ratingValue: number;
  ratingCount: number;
  price?: string;
  priceCurrency?: string;
} | null) {
  // VideoGame is a SoftwareApplication subtype, so validators hold it to
  // app rules: applicationCategory, offers, and aggregateRating. The
  // rating and price come from Steam's public APIs (see lib/steam-meta),
  // real numbers, refreshed daily — when the fetch fails the optional
  // fields drop out rather than shipping stale hardcoded values.
  // "GameApplication" is the correct category taxonomy value (an earlier
  // attempt used "Game", which validators flagged).
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Slay the Spire 2",
    description:
      "A roguelike deck-building game where you craft a unique deck, encounter bizarre creatures, discover relics of immense power, and slay the Spire.",
    genre: ["Roguelike", "Deck-building", "Strategy"],
    gamePlatform: ["PC"],
    operatingSystem: "Windows",
    applicationCategory: "GameApplication",
    image: DEFAULT_OG_IMAGE,
    publisher: { "@type": "Organization", name: "Mega Crit Games" },
    // author, not developer: schema.org has no `developer` property on
    // SoftwareApplication/VideoGame (validators flag it NOT_RECOGNIZED);
    // author is the CreativeWork-sanctioned way to credit the studio.
    author: { "@type": "Organization", name: "Mega Crit Games" },
    url: STEAM_STORE_URL,
    ...(steam && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: steam.ratingValue,
        bestRating: 100,
        worstRating: 0,
        ratingCount: steam.ratingCount,
      },
    }),
    ...(steam?.price && {
      offers: {
        "@type": "Offer",
        price: steam.price,
        priceCurrency: steam.priceCurrency,
        url: STEAM_STORE_URL,
        availability: "https://schema.org/InStock",
      },
    }),
  };
}

export function buildSoftwareApplicationJsonLd() {
  // WebAPI, not SoftwareApplication: the thing described is a REST API,
  // and SoftwareApplication carries rich-result requirements (a rating or
  // review) that nothing can honestly satisfy for an API. WebAPI is the
  // schema.org type for exactly this and, as a Service subtype, supports
  // provider/offers/termsOfService with no rating obligation.
  return {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "Spire Codex API",
    url: `${SITE_URL}/developers`,
    image: DEFAULT_OG_IMAGE,
    description:
      "Public REST API and embeddable tooltip widget for Slay the Spire 2 game data. 22+ endpoints, 14-language support, no authentication required.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    provider: PUBLISHER_ORG,
    termsOfService: `${SITE_URL}/terms`,
  };
}

export function buildFAQPageJsonLd(
  questions: { question: string; answer: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };
}

/**
 * NewsArticle JSON-LD for /news/{gid} pages.
 *
 * mainEntityOfPage points to Steam (where the announcement originated) so we
 * surface as an additive mirror, not a duplicate. Date fields are required by
 * schema.org's NewsArticle; we use the same value for published/modified
 * since Steam doesn't expose an edit timestamp.
 */
export function buildNewsArticleJsonLd({
  headline,
  description,
  datePublished,
  dateModified,
  author,
  feedlabel,
  externalCanonical,
  externalUrl,
  path,
  inLanguage,
  imageUrl,
}: {
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author?: string | null;
  feedlabel?: string | null;
  externalCanonical: string;
  externalUrl?: string;
  path: string;
  inLanguage?: string;
  imageUrl?: string;
}) {
  // Publisher is the news source (Mega Crit or external publisher),
  // not Spire Codex, we're mirroring. Google requires
  // publisher.logo on NewsArticle; we use the default OG asset as a
  // stable fallback when we don't have the publisher's actual logo.
  const publisherName = feedlabel || "Mega Crit";
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    description,
    datePublished,
    dateModified: dateModified ?? datePublished,
    // NewsArticle requires `image` for Rich Results. Steam's news
    // feed doesn't expose a per-article image URL on the
    // ISteamNews/GetNewsForApp response, so we anchor to the
    // sitewide OG asset until per-article images are extracted.
    image: imageUrl ?? DEFAULT_OG_IMAGE,
    author: author
      ? { "@type": "Person", name: author }
      : { "@type": "Organization", name: publisherName },
    publisher: {
      "@type": "Organization",
      name: publisherName,
      logo: {
        "@type": "ImageObject",
        url: DEFAULT_OG_IMAGE,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": externalCanonical },
    ...(externalUrl ? { isBasedOn: externalUrl } : {}),
    url: `${SITE_URL}${path}`,
    inLanguage: inLanguage ?? "en",
    // "Thing", not "VideoGame": a nested VideoGame stub with only a name
    // gets validated against full SoftwareApplication rules by crawlers and
    // flagged for every field it lacks. Thing carries the same topical
    // signal without the app schema obligations.
    about: { "@type": "Thing", name: "Slay the Spire 2" },
  };
}
