import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { SLUG_MAP, type SlugEntry } from "./slug-map";
import { getT } from "@/lib/i18n-server";
import { localeOf, localePath } from "@/lib/locale";

type Props = { params: Promise<{ locale: string }> };

const GROUPS: { title: string; category: SlugEntry["category"]; icon: string }[] = [
  { title: "By Type", category: "type", icon: "⚔" },
  { title: "By Rarity", category: "rarity", icon: "✦" },
  { title: "By Character", category: "character", icon: "👤" },
  { title: "By Keyword", category: "keyword", icon: "🏷" },
  { title: "Combinations", category: "combo", icon: "🔀" },
];

const characterColors: Record<string, string> = {
  ironclad: "border-red-700/40 hover:border-red-500",
  silent: "border-green-700/40 hover:border-green-500",
  defect: "border-blue-700/40 hover:border-blue-500",
  necrobinder: "border-purple-700/40 hover:border-purple-500",
  regent: "border-orange-700/40 hover:border-orange-500",
};

const characterTextColors: Record<string, string> = {
  ironclad: "text-red-400",
  silent: "text-green-400",
  defect: "text-blue-400",
  necrobinder: "text-purple-400",
  regent: "text-orange-400",
};

const rarityColors: Record<string, string> = {
  common: "text-gray-300",
  uncommon: "text-blue-400",
  rare: "text-[var(--accent-gold)]",
};

function getCardStyle(slug: string, entry: SlugEntry) {
  // Character-specific borders
  const color = entry.params.color;
  if (color && characterColors[color]) {
    return {
      border: characterColors[color],
      text: characterTextColors[color] || "text-[var(--text-primary)]",
    };
  }
  // Rarity-specific text
  const rarity = entry.params.rarity?.toLowerCase();
  if (rarity && rarityColors[rarity]) {
    return {
      border: "border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/40",
      text: rarityColors[rarity],
    };
  }
  return {
    border: "border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/40",
    text: "text-[var(--text-primary)]",
  };
}

export default async function BrowseHubPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const allEntries = Object.entries(SLUG_MAP);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Cards"), href: localePath(locale, "/cards") },
      { name: t("Browse"), href: localePath(locale, "/cards/browse") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Cards - Browse by Category",
      description:
        "Browse Slay the Spire 2 cards by type, rarity, character, and keyword. Find filtered subsets of all cards.",
      path: "/cards/browse",
      items: allEntries.map(([slug, entry]) => ({
        name: entry.label,
        path: `/cards/browse/${slug}`,
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Browse Cards by Category")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("Explore Slay the Spire 2 cards organized by type, rarity, character, and keyword. Each category shows a filtered view of all matching cards.")}
      </p>

      {GROUPS.map((group) => {
        const entries = allEntries.filter(([, e]) => e.category === group.category);
        if (entries.length === 0) return null;

        return (
          <section key={group.category} className="mb-10">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <span>{group.icon}</span>
              {t(group.title)}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {entries.map(([slug, entry]) => {
                const style = getCardStyle(slug, entry);
                return (
                  <Link
                    key={slug}
                    href={`/cards/browse/${slug}`}
                    className={`rounded-lg border ${style.border} bg-[var(--bg-card)] p-4 transition-all hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/20`}
                  >
                    <h3 className={`font-semibold text-sm ${style.text}`}>
                      {entry.label}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                      {entry.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-muted)]">
          {t("Looking for the full card list?")}{" "}
          <Link href="/cards" className="text-[var(--accent-gold)] hover:underline">
            {t("View all cards")}
          </Link>
        </p>
      </div>
    </div>
  );
}
