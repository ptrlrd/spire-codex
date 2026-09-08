import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import BuilderLoader from "../BuilderLoader";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: `/tier-list-maker/${id}`, title: t("Tier List Maker"), noIndex: true });
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <BuilderLoader tierlistId={id} />;
}
