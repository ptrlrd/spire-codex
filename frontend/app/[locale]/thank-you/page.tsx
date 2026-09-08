import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import ThankYouBody from "./ThankYouBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/thank-you", title: t("Thank You"), description: t("thank-you_meta_description") });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <ThankYouBody lang={locale} />;
}
