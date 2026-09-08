import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import OverlayBody from "./OverlayBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/overlay", title: t("Overwolf Overlay"), description: t("overlay_meta_description") });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <OverlayBody lang={locale} />;
}
