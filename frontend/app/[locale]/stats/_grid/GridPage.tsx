import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { KINDS } from "./kinds";
import { loadGrid } from "./load";
import StatsGrid from "./StatsGrid";
import type { GridKind } from "./types";

export type GridPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    bracket?: string;
    character?: string;
    by?: string;
    q?: string;
  }>;
};

export async function gridMetadata(
  kind: GridKind,
  { params, searchParams }: GridPageProps,
): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const cfg = KINDS[kind];
  return buildPageMetadata({
    locale,
    path: cfg.path,
    title: t(cfg.title),
    description: t(cfg.description),
    hreflang: !(sp.bracket || sp.character || sp.by || sp.q),
  });
}

export async function GridPage({
  kind,
  params,
  searchParams,
}: GridPageProps & { kind: GridKind }) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const cfg = KINDS[kind];
  const data = await loadGrid(
    kind,
    locale,
    sp.bracket || "all",
    sp.character || "",
    sp.by || "",
    sp.q || "",
  );
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Stats"), href: localePath(locale, "/stats") },
      { name: t(cfg.title), href: localePath(locale, cfg.path) },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t(cfg.title)),
      description: t(cfg.description),
      path: localePath(locale, cfg.path),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <StatsGrid data={data} />
    </>
  );
}
