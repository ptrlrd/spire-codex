import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import LabIntro from "@/app/components/LabIntro";
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
      <Suspense
        fallback={
          <LabIntro
            title={t("Seed Finder")}
            badge={t("Preview")}
            lines={[
              t(
                "Search seeds the community has actually played into the run start you want: Neow offers, card rewards by floor, relics, events, ancients, bosses, shop stock and the final deck. Every hit is a real run with a real outcome.",
              ),
              t(
                "Seeds are locked to specific achievement unlocks. For the best experience, only use this tool when you're at max achievements and Ascension 10.",
              ),
              t(
                "Main and beta hash seeds differently, so pick the version you play. Every result is a lobby that showed everything you asked for, most wins first.",
              ),
            ]}
          />
        }
      >
        <SeedFinderClient />
      </Suspense>
    </>
  );
}
