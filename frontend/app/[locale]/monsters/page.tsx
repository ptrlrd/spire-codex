import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { Monster } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import MonstersClient from "./MonstersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/monsters", title: t("Monsters"), description: t("monsters_meta_description") });
}

export default async function MonstersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Monsters"));
  const tagline = t("monsters_tagline");
  let monsters: Monster[] = [];
  try {
    const res = await fetch(`${API}/api/monsters?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) monsters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Monsters"), href: localePath(locale, "/monsters") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Monsters",
      description: "Browse every monster in Slay the Spire 2.",
      path: localePath(locale, "/monsters"),
      inLanguage: inLanguageOf(locale),
      items: monsters.map((m) => ({ name: m.name, path: `/monsters/${m.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <RecentlyAdded entityType="monsters" label="Monster" pathPrefix="/monsters" />

      <Suspense>
        <MonstersClient initialMonsters={monsters} />
      </Suspense>
    </div>
  );
}
