import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/images",
      title: "Images - Game Art & Assets - Slay the Spire 2 (sts2) | Spire Codex",
      description:
        "Browse and download Slay the Spire 2 game assets, card portraits, relic icons, monster sprites, character art, and more.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  return listMetadata(locale, {
    path: "/images",
    title: `${gameName} ${t("Images")} | Spire Codex (${LANG_NAMES[locale]})`,
    description: `${gameName} ${t("Images")} (${LANG_NAMES[locale]}). Browse and download game assets, card portraits, relic icons, monster sprites, and character art.`,
  });
}

export default async function Layout({ children, params }: Props & { children: React.ReactNode }) {
  const locale = localeOf((await params).locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: uiText(locale, "Home"), href: localePath(locale, "/") },
      { name: uiText(locale, "Images"), href: localePath(locale, "/images") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Images & Game Art",
      description:
        "Browse and download Slay the Spire 2 game assets, card portraits, relic icons, monster sprites, character art, and more.",
      path: localePath(locale, "/images"),
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
