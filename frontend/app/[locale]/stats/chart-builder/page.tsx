import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import ChartBuilderClient from "./ChartBuilderClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/stats/chart-builder",
    title: t("Chart Builder"),
    description: t("chart_builder_meta_description"),
  });
}

export default async function ChartBuilderPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">
          {pageHeading(locale, t("Chart Builder"))}
        </span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("chart_builder_tagline")}
      </p>
      <Suspense fallback={null}>
        <ChartBuilderClient />
      </Suspense>
    </div>
  );
}
