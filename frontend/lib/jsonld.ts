import { SITE_URL, SITE_NAME } from "./seo";

interface BreadcrumbItem {
  name: string;
  href: string;
}

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
}: {
  name: string;
  description: string;
  path: string;
  items?: { name: string; path: string }[];
}) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${SITE_URL}${path}`,
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

export function buildDetailPageJsonLd({
  name,
  description,
  path,
  imageUrl,
  category,
  breadcrumbs,
}: {
  name: string;
  description: string;
  path: string;
  imageUrl?: string;
  category: string;
  breadcrumbs: BreadcrumbItem[];
}) {
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: name,
    description,
    url: `${SITE_URL}${path}`,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    about: {
      "@type": "Thing",
      name: `Slay the Spire 2 ${category}`,
    },
  };

  if (imageUrl) {
    article.image = imageUrl;
  }

  return [article, buildBreadcrumbJsonLd(breadcrumbs)];
}

export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "The complete Slay the Spire 2 database. Browse all cards, relics, characters, monsters, potions, events, powers, and more.",
  };
}

export function buildVideoGameJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Slay the Spire 2",
    description:
      "A roguelike deck-building game where you craft a unique deck, encounter bizarre creatures, discover relics of immense power, and slay the Spire.",
    genre: ["Roguelike", "Deck-building", "Strategy"],
    gamePlatform: ["PC"],
    operatingSystem: "Windows",
    applicationCategory: "Game",
    publisher: { "@type": "Organization", name: "Mega Crit Games" },
    developer: { "@type": "Organization", name: "Mega Crit Games" },
    url: "https://store.steampowered.com/app/2868840/Slay_the_Spire_2/",
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
