import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import BrowseRunsClient from "./BrowseRunsClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/runs", title: t("Browse Runs"), description: t("runs_meta_description") });
}

export default function RunsPage() {
  return <BrowseRunsClient />;
}
