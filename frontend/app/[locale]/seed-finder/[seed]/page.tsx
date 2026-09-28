import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n-server";
import { localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import SeedInspectClient from "./SeedInspectClient";

type Props = { params: Promise<{ locale: string; seed: string }> };

function cleanSeed(raw: string): string {
  return decodeURIComponent(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, seed: rawSeed } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const seed = cleanSeed(rawSeed);
  return buildPageMetadata({
    locale,
    path: `/seed-finder/${seed}`,
    title: t("Seed {seed}", { seed }),
    description: t("seed_inspect_meta_description", { seed }),
    noIndex: true,
  });
}

export default async function SeedInspectPage({ params }: Props) {
  const { locale: rawLocale, seed: rawSeed } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const seed = cleanSeed(rawSeed);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Seed Finder"), href: localePath(locale, "/seed-finder") },
      { name: seed, href: localePath(locale, `/seed-finder/${seed}`) },
    ]),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense fallback={null}>
        <SeedInspectClient seed={seed} />
      </Suspense>
    </>
  );
}
