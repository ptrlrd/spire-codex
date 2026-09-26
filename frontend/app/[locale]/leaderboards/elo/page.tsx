import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import EloBoardClient from "./EloBoardClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/leaderboards/elo",
    title: t("Spire Codex Top Players"),
    description: t("elo_meta_description"),
  });
}

export default async function EloBoardPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      {
        name: t("Top Players"),
        href: localePath(locale, "/leaderboards/elo"),
      },
    ]),
    buildCollectionPageJsonLd({
      name: t("Spire Codex Top Players"),
      description: t("elo_meta_description"),
      path: localePath(locale, "/leaderboards/elo"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <EloBoardClient />
    </>
  );
}
