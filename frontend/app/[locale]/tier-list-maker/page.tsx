import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import TierListHome from "./TierListHome";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/tier-list-maker", title: t("Tier List Maker"), description: t("tier-list-maker_meta_description") });
}

export default function Page() {
  return <TierListHome />;
}
