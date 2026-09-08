import { getT } from "@/lib/i18n-server";
import { localeOf, localePath } from "@/lib/locale";
import type { Metadata } from "next";
import { Suspense } from "react";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import ChartsClient from "./ChartsClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/charts", title: t("Run Charts"), description: t("charts_meta_description") });
}

export default async function ChartsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Run Charts"));
  const tagline = t("charts_tagline");
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Charts"), href: localePath(locale, "/charts") },
    ]),
  ];
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>
      <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">{t("Loading…")}</div>}>
        <ChartsClient />
      </Suspense>
    </div>
  );
}
