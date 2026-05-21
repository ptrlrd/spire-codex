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
// codex launch date — accurate for "when did Spire Codex publish a
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
  // schema.org spec — Google substitutes the user's query into it.
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "The complete Slay the Spire 2 database. Browse all cards, relics, characters, monsters, potions, events, powers, and more.",
    publisher: PUBLISHER_ORG,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildVideoGameJsonLd() {
  // VideoGame is a SoftwareApplication subtype. We previously set
  // `applicationCategory: "Game"` here but that field is for the
  // SoftwareApplication category taxonomy (e.g. "GameApplication")
  // and validators flag it as confusing when paired with VideoGame.
  // Dropped — `@type: VideoGame` already conveys "this is a game".
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Slay the Spire 2",
    description:
      "A roguelike deck-building game where you craft a unique deck, encounter bizarre creatures, discover relics of immense power, and slay the Spire.",
    genre: ["Roguelike", "Deck-building", "Strategy"],
    gamePlatform: ["PC"],
    operatingSystem: "Windows",
    image: DEFAULT_OG_IMAGE,
    publisher: { "@type": "Organization", name: "Mega Crit Games" },
    developer: { "@type": "Organization", name: "Mega Crit Games" },
    url: "https://store.steampowered.com/app/2868840/Slay_the_Spire_2/",
  };
}

export function buildSoftwareApplicationJsonLd() {
  // Google's SoftwareApplication rich-results gate on `aggregateRating`
  // or `offers`. We don't accept reviews — keep `offers` (free) so the
  // schema passes validation. `image` added so the result is eligible
  // for SoftwareApp panel display.
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Spire Codex API",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    url: `${SITE_URL}/developers`,
    image: DEFAULT_OG_IMAGE,
    description:
      "Public REST API and embeddable tooltip widget for Slay the Spire 2 game data. 22+ endpoints, 14-language support, no authentication required.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: PUBLISHER_ORG,
    featureList: [
      "REST API with 22+ endpoints",
      "Embeddable tooltip widget for all 13 entity types",
      "14-language support",
      "Downloadable JSON data exports",
    ],
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
  // not Spire Codex — we're mirroring. Google requires
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
    about: { "@type": "VideoGame", name: "Slay the Spire 2" },
  };
}
