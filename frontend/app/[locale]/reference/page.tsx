import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
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

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 Reference", title: "Slay the Spire 2 Reference | Spire Codex", description: "Quick reference for Slay the Spire 2 game mechanics, keywords, orbs, afflictions, intents, modifiers, achievements, acts, and ascension levels.", tagline: "Quick reference for Slay the Spire 2 game mechanics, keywords, orbs, afflictions, intents, modifiers, achievements, acts, and ascension levels." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Reference")}`;
  const desc = `${gameName} ${t("Reference")} (${nativeName}). Keywords, orbs, afflictions, intents, modifiers, achievements, acts, and ascension levels all in one place.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("reference_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/reference", title: copy.title, description: copy.description });
}

export default async function ReferencePage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
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
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <ReferenceClient initialData={data} />
    </div>
  );
}
