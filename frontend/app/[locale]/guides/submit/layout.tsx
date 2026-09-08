import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/guides/submit", title: t("Submit a Guide"), description: t("guides_submit_meta_description") });
}

export default function GuideSubmitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
