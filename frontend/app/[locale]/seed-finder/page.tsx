import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import SeedFinderClient from "./SeedFinderClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/seed-finder",
    title: t("Seed Finder"),
    description: t("seed_finder_meta_description"),
  });
}

export default async function SeedFinderPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Seed Finder"), href: localePath(locale, "/seed-finder") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Seed Finder")),
      description: t("seed_finder_meta_description"),
      path: localePath(locale, "/seed-finder"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense fallback={null}>
        <SeedFinderClient />
      </Suspense>
    </>
  );
}
