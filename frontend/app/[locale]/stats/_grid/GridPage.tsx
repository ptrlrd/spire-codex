import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { DEFAULT_BRACKET } from "./bracket";
import { parseGridView } from "./prefs";
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
    offcolor?: string;
    sort?: string;
    dir?: string;
    samples?: string;
    wax?: string;
    upg?: string;
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
    hreflang: !(
      sp.bracket ||
      sp.character ||
      sp.by ||
      sp.q ||
      sp.offcolor ||
      sp.sort ||
      sp.dir ||
      sp.samples ||
      sp.wax ||
      sp.upg
    ),
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
    sp.bracket || DEFAULT_BRACKET,
    sp.character || "",
    sp.by || "",
    sp.q || "",
  );
  data.offColor = sp.offcolor === "1";
  const view = parseGridView(sp, KINDS[kind].columns);
  data.sort = view.sort;
  data.dir = view.dir === 1 ? "asc" : view.dir === -1 ? "desc" : undefined;
  data.samples = view.samples;
  data.wax = view.wax;
  data.upg = view.upg;
  data.fromUrl = Boolean(
    sp.bracket ||
    sp.character ||
    sp.by ||
    sp.q ||
    sp.offcolor ||
    view.sort ||
    view.dir ||
    view.samples ||
    view.wax ||
    view.upg,
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
