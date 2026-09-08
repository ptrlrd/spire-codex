import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import GiveawayClient from "./GiveawayClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/giveaway", title: t("Shadowbox Giveaway"), description: t("giveaway_meta_description") });
}

export default function GiveawayPage() {
  return <GiveawayClient />;
}
