import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, uiText } from "@/lib/locale";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/changelog",
      title: "Changelog - Update History - Slay the Spire 2 (sts2) | Spire Codex",
      description:
        "Slay the Spire 2 update history and Spire Codex changelog. Track game patches, balance changes, and new content additions.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  return listMetadata(locale, {
    path: "/changelog",
    title: `${gameName} ${t("Changelog")} | Spire Codex (${LANG_NAMES[locale]})`,
    description: `Track what changes between ${gameName} game updates, new cards, balance tweaks, removed content, and more. ${LANG_NAMES[locale]}.`,
  });
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
