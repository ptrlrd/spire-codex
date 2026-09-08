import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import { TierListBody } from "./TierListBody";

// Tier-list hub: scores refresh on the backend every 60s, so 5min
// HTML cache is comfortably fresh and lets CF serve from edge.
export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/tier-list", title: t("Tier List - Cards, Relics & Potions Ranked"), description: t("tier-list_meta_description") });
}

export default async function TierListIndex({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <TierListBody lang={locale} />;
}
