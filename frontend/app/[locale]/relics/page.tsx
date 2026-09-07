import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES, LANG_RELICS } from "@/lib/languages";
import { Suspense } from "react";
import type { Relic } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import HighestRated from "@/app/components/HighestRated";
import RelicsClient from "./RelicsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Relics", title: "Slay the Spire 2 (sts2) Relics | Spire Codex", description: "Browse every relic across Ironclad, Silent, Defect, Necrobinder, and Regent. Filter by rarity and character pool.", tagline: "Browse every relic across Ironclad, Silent, Defect, Necrobinder, and Regent. Filter by rarity and character pool." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${LANG_RELICS[locale]}`;
  const desc = `${gameName} ${LANG_RELICS[locale]} (${nativeName}). ${t("Every relic by rarity and character pool, effects, flavor text, shop prices, and upgraded starters.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("relics_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/relics", title: copy.title, description: copy.description });
}

export default async function RelicsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let relics: Relic[] = [];
  try {
    const res = await fetch(`${API}/api/relics?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) relics = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Relics"), href: localePath(locale, "/relics") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Relics",
      description: "Browse every relic across all rarities and character pools.",
      path: localePath(locale, "/relics"),
      inLanguage: inLanguageOf(locale),
      items: relics.map((r) => ({ name: r.name, path: `/relics/${r.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <HighestRated
        lang={locale}
        entityType="relics"
        entities={relics}
        label="relics"
        pathPrefix="/relics"
        tierHref="/tier-list/relics"
      />

      <RecentlyAdded entityType="relics" label="Relic" pathPrefix="/relics" />

      <Suspense>
        <RelicsClient initialRelics={relics} />
      </Suspense>
    </div>
  );
}
