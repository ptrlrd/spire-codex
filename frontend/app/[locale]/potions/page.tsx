import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import HighestRated from "@/app/components/HighestRated";
import PotionsClient from "./PotionsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/potions", title: t("Potions"), description: t("potions_meta_description") });
}

export default async function PotionsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Potions"));
  const tagline = t("potions_tagline");
  let potions: Potion[] = [];
  try {
    const res = await fetch(`${API}/api/potions?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) potions = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Potions"), href: localePath(locale, "/potions") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Potions",
      description: "Browse every potion across all character pools.",
      path: localePath(locale, "/potions"),
      inLanguage: inLanguageOf(locale),
      items: potions.map((p) => ({ name: p.name, path: `/potions/${p.id.toLowerCase()}` })),
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
        entityType="potions"
        entities={potions}
        label="potions"
        pathPrefix="/potions"
        tierHref="/tier-list/potions"
      />

      <RecentlyAdded entityType="potions" label="Potion" pathPrefix="/potions" />

      <Suspense>
        <PotionsClient initialPotions={potions} />
      </Suspense>
    </div>
  );
}
