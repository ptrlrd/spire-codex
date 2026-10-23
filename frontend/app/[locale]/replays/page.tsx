import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import { REPLAYS_BROWSE } from "@/lib/browse-config";
import BrowseRunsClient from "../runs/BrowseRunsClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/replays",
    title: t("Browse Replays"),
    description: t("replays_meta_description"),
  });
}

export default function ReplaysPage() {
  return <BrowseRunsClient config={REPLAYS_BROWSE} />;
}
