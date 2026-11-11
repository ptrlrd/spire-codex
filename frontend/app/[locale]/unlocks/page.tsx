import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { API_INTERNAL } from "@/lib/api/endpoint.common";
import UnlocksClient, { type UnlocksData } from "./UnlocksClient";

async function fetchUnlocks(locale: string): Promise<UnlocksData | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/unlocks?lang=${locale}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<UnlocksData> | null;
    if (
      !body ||
      !Array.isArray(body.characters) ||
      !Array.isArray(body.cards) ||
      !Array.isArray(body.relics) ||
      !Array.isArray(body.potions)
    )
      return null;
    return body as UnlocksData;
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/unlocks",
    title: t("Unlocks - All Unlockable Cards, Relics & Potions"),
    description: t("unlocks_meta_description"),
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const initial = await fetchUnlocks(locale);
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
      <UnlocksClient initial={initial} />
    </>
  );
}
