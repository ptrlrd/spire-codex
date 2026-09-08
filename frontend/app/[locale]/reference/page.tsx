import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath, type Locale } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type {
  Act,
  Ascension,
  Keyword,
  Orb,
  Affliction,
  Intent,
  Modifier,
  Achievement,
} from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import ReferenceClient from "./ReferenceClient";
import type { ReferenceData } from "./ReferenceClient";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

async function fetchSection<T>(endpoint: string, locale: Locale): Promise<T[]> {
  try {
    const res = await fetch(`${API}/api/${endpoint}?lang=${locale}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/reference", title: t("Reference"), description: t("reference_meta_description") });
}

export default async function ReferencePage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Reference"));
  const tagline = t("reference_tagline");
  const [acts, ascensions, keywords, orbs, afflictions, intents, modifiers, achievements] =
    await Promise.all([
      fetchSection<Act>("acts", locale),
      fetchSection<Ascension>("ascensions", locale),
      fetchSection<Keyword>("keywords", locale),
      fetchSection<Orb>("orbs", locale),
      fetchSection<Affliction>("afflictions", locale),
      fetchSection<Intent>("intents", locale),
      fetchSection<Modifier>("modifiers", locale),
      fetchSection<Achievement>("achievements", locale),
    ]);

  const data: ReferenceData = {
    acts,
    ascensions,
    keywords,
    orbs,
    afflictions,
    intents,
    modifiers,
    achievements,
  };

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Reference"), href: localePath(locale, "/reference") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Reference",
      description:
        "Quick reference for Slay the Spire 2 game mechanics, keywords, orbs, afflictions, intents, modifiers, achievements, acts, and ascension levels.",
      path: localePath(locale, "/reference"),
      inLanguage: inLanguageOf(locale),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <ReferenceClient initialData={data} />
    </div>
  );
}
