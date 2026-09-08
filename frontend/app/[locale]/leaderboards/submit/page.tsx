import { getT } from "@/lib/i18n-server";
import { localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import SubmitRunClient from "./SubmitRunClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/leaderboards/submit", title: t("Submit a Run"), description: t("leaderboards_submit_meta_description") });
}

export default async function SubmitRunPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = buildBreadcrumbJsonLd([
    { name: t("Home"), href: localePath(locale, "/") },
    { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
    { name: t("Submit a Run"), href: localePath(locale, "/leaderboards/submit") },
  ]);
  return (
    <>
      <JsonLd data={jsonLd} />
      <SubmitRunClient />
    </>
  );
}
