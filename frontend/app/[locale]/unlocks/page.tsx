import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import UnlocksClient from "./UnlocksClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/unlocks", title: t("Unlocks - All Unlockable Cards, Relics & Potions"), description: t("unlocks_meta_description") });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Unlocks"), href: localePath(locale, "/unlocks") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Unlocks")),
      description: t("unlocks_meta_description"),
      path: localePath(locale, "/unlocks"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <UnlocksClient />
    </>
  );
}
