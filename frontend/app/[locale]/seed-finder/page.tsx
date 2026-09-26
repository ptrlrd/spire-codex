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
                "Search community runs for seeds that demonstrably produced a combination of content: cards offered or kept, relics obtained, events encountered, ancient offers. A hit is a real run. Open it to see the route that got there.",
              ),
              t(
                "Seeds are locked to specific achievement unlocks. For the best experience, only use this tool when you're at max achievements and Ascension 10.",
              ),
              t(
                "Covers solo runs at ascension 0 to 10 on the main game version. Every seed shown matched at least one thing you asked for; full matches come first.",
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
