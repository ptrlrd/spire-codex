import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import AncientsClient from "./AncientsClient";

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/ancients", title: t("Ancient Relic Pools - All Ancient Offerings"), description: t("ancients_meta_description") });
}

export default async function AncientsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Ancients"), href: localePath(locale, "/ancients") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Ancient Relic Pools",
      description:
        "Relic pools for all 8 Slay the Spire 2 Ancients, every offering and the conditions required to receive it.",
      path: localePath(locale, "/ancients"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <AncientsClient />
    </>
  );
}
