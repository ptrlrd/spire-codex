import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import ModifiersClient from "./ModifiersClient";

// Pure client component, no fetches, pre-rendered at build time and
// cached at CF edge indefinitely (modifier data only changes on deploy).

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/modifiers", title: t("Custom Mode Modifiers - All Modifiers"), description: t("modifiers_meta_description") });
}

export default async function ModifiersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Modifiers"), href: localePath(locale, "/modifiers") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Modifiers")),
      description: t("modifiers_meta_description"),
      path: localePath(locale, "/modifiers"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <ModifiersClient />
    </>
  );
}
