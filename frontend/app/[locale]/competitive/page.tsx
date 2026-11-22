import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import CompetitiveClient from "./CompetitiveClient";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/competitive",
    title: t("Slay the Spire 2 Competitive Leaderboards"),
    description: t("competitive_meta_description"),
  });
}

export default async function CompetitivePage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Competitive"), href: localePath(locale, "/competitive") },
    ]),
    buildCollectionPageJsonLd({
      name: t("Slay the Spire 2 Competitive Leaderboards"),
      description: t("competitive_meta_description"),
      path: localePath(locale, "/competitive"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense fallback={null}>
        <CompetitiveClient />
      </Suspense>
    </>
  );
}
