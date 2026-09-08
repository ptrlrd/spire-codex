import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/changelog", title: t("Changelog - Update History"), description: t("changelog_meta_description") });
}

export default async function Layout({ children, params }: Props & { children: React.ReactNode }) {
  const locale = localeOf((await params).locale);
  // Client-rendered changelog page, emit JSON-LD from the server
  // layout so the structured data appears in initial HTML for crawlers.
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: uiText(locale, "Home"), href: localePath(locale, "/") },
      { name: uiText(locale, "Changelog"), href: localePath(locale, "/changelog") },
    ]),
    buildCollectionPageJsonLd({
      name: "Spire Codex Changelog",
      description:
        "Slay the Spire 2 update history and Spire Codex changelog, patches, balance changes, and new content additions.",
      path: localePath(locale, "/changelog"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
