import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { Link } from "@/i18n/navigation";

const CHARACTERS = [
  { id: "ironclad", name: "Ironclad", color: "red" },
  { id: "silent", name: "Silent", color: "green" },
  { id: "defect", name: "Defect", color: "blue" },
  { id: "necrobinder", name: "Necrobinder", color: "purple" },
  { id: "regent", name: "Regent", color: "orange" },
];

const colorBorder: Record<string, string> = {
  red: "border-[var(--color-ironclad)]/40",
  green: "border-[var(--color-silent)]/40",
  blue: "border-[var(--color-defect)]/40",
  purple: "border-[var(--color-necrobinder)]/40",
  orange: "border-[var(--color-regent)]/40",
};

const colorText: Record<string, string> = {
  red: "text-[var(--color-ironclad)]",
  green: "text-[var(--color-silent)]",
  blue: "text-[var(--color-defect)]",
  purple: "text-[var(--color-necrobinder)]",
  orange: "text-[var(--color-regent)]",
};

function generatePairs() {
  const pairs: { a: (typeof CHARACTERS)[number]; b: (typeof CHARACTERS)[number]; slug: string }[] = [];
  for (let i = 0; i < CHARACTERS.length; i++) {
    for (let j = i + 1; j < CHARACTERS.length; j++) {
      const a = CHARACTERS[i];
      const b = CHARACTERS[j];
      pairs.push({ a, b, slug: `${a.id}-vs-${b.id}` });
    }
  }
  return pairs;
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/compare", title: t("Character Comparisons"), description: t("compare_meta_description") });
}

export default async function ComparePage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Character Comparisons"));
  const tagline = t("compare_tagline");
  const pairs = generatePairs();

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Compare"), href: localePath(locale, "/compare") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Character Comparisons",
      description:
        "Compare all Slay the Spire 2 (sts2) characters side by side. Stats, card pools, keywords, and starting decks.",
      path: localePath(locale, "/compare"),
      inLanguage: inLanguageOf(locale),
      items: pairs.map((p) => ({
        name: `${p.a.name} vs ${p.b.name}`,
        path: `/compare/${p.slug}`,
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pairs.map((pair) => (
          <Link
            key={pair.slug}
            href={`/compare/${pair.slug}`}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 transition-all hover:shadow-lg hover:shadow-scrim/20 hover:border-[var(--accent-gold)]/40"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 text-center">
                <span
                  className={`text-lg font-bold ${colorText[pair.a.color]}`}
                >
                  {t(pair.a.name)}
                </span>
              </div>
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest flex-shrink-0">
                {t("vs")}
              </span>
              <div className="flex-1 text-center">
                <span
                  className={`text-lg font-bold ${colorText[pair.b.color]}`}
                >
                  {t(pair.b.name)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className={`flex-1 h-0.5 rounded ${colorBorder[pair.a.color]} border-t`} />
              <div className={`flex-1 h-0.5 rounded ${colorBorder[pair.b.color]} border-t`} />
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center mt-3">
              {t("Stats, cards, keywords & starting decks")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
