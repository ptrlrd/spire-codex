import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { Relic } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import HighestRated from "@/app/components/HighestRated";
import RelicsClient from "./RelicsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/relics", title: t("Relics"), description: t("relics_meta_description") });
}

export default async function RelicsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Relics"));
  const tagline = t("relics_tagline");
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
      name: pageHeading(locale, t("Relics")),
      description: t("relics_meta_description"),
      path: localePath(locale, "/relics"),
      inLanguage: inLanguageOf(locale),
      items: relics.map((r) => ({ name: r.name, path: localePath(locale, `/relics/${r.id.toLowerCase()}`) })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

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
