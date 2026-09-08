import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import LeaderboardBrowseClient from "./LeaderboardBrowseClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/leaderboards", title: t("Leaderboards"), description: t("leaderboards_meta_description") });
}

export default async function ToolsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Leaderboards"));
  const description = t("leaderboards_meta_description");
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
    ]),
    buildCollectionPageJsonLd({
      name: heading,
      description,
      path: localePath(locale, "/leaderboards"),
      inLanguage: inLanguageOf(locale),
    }),
  ];

  // LeaderboardBrowseClient calls `useSearchParams()`, which opts the
  // whole tree out of static prerender and was preventing the JSON-LD
  // sibling from making it into the SSR HTML, GSC saw zero
  // structured data on /leaderboards. Wrapping the client component
  // in <Suspense> isolates the bailout so the JsonLd ships in the
  // initial server response.
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense>
        <LeaderboardBrowseClient />
      </Suspense>
    </>
  );
}
