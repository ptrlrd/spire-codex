import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Character } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import CharactersClient from "./CharactersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/characters", title: t("Characters"), description: t("characters_meta_description") });
}

export default async function CharactersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Characters"));
  const tagline = t("characters_tagline");
  let characters: Character[] = [];
  try {
    const res = await fetch(`${API}/api/characters?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) characters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Characters"), href: localePath(locale, "/characters") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Characters",
      description: "All playable characters in Slay the Spire 2.",
      path: localePath(locale, "/characters"),
      inLanguage: inLanguageOf(locale),
      items: characters.map((c) => ({ name: c.name, path: `/characters/${c.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <CharactersClient initialCharacters={characters} />
    </div>
  );
}
