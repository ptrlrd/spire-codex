import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import LabIntro from "@/app/components/LabIntro";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import DeckBuilderClient from "./DeckBuilderClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/deck-builder",
    title: t("Deck Builder"),
    description: t("deck_builder_meta_description"),
  });
}

export default async function DeckBuilderPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Deck Builder"), href: localePath(locale, "/deck-builder") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Deck Builder")),
      description: t("deck_builder_meta_description"),
      path: localePath(locale, "/deck-builder"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense
        fallback={
          <LabIntro
            title={t("Deck Builder")}
            badge={t("Preview")}
            lines={[
              t(
                "Sketch a draft and see what the community data says: the archetype it is becoming, what winners with similar decks took next, and how each card in an offer commits you.",
              ),
              t("deck_builder_scope"),
            ]}
          />
        }
      >
        <DeckBuilderClient />
      </Suspense>
    </>
  );
}
