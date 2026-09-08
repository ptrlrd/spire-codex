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
  return buildPageMetadata({ locale, path: "/images", title: t("Images - Game Art & Assets"), description: t("images_meta_description") });
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
