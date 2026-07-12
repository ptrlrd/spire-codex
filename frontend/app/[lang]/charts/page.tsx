import type { Metadata } from "next";
import { Suspense } from "react";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import ChartsClient from "@/app/charts/ChartsClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  return {
    title: `${gameName} Run Charts | ${SITE_NAME} (${nativeName})`,
    description:
      "Interactive charts over community-submitted Slay the Spire 2 runs: win rate by floor, ascension and over time, damage per encounter, run stat distributions and scatters. Filter by player count, ascension, game mode, or a single player.",
    alternates: {
      canonical: `${SITE_URL}/${lang}/charts`,
      languages: buildLanguageAlternates("/charts"),
    },
    openGraph: {
      title: `${gameName} Run Charts | ${SITE_NAME}`,
      description:
        "Dig into aggregates of community-submitted Slay the Spire 2 runs with interactive charts.",
      url: `${SITE_URL}/${lang}/charts`,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title: `${gameName} Run Charts | ${SITE_NAME}` },
  };
}

export default async function LangChartsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: `/${lang}` },
      { name: "Charts", href: `/${lang}/charts` },
    ]),
  ];
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Run Charts</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Interactive aggregates over community-submitted runs. Pick a chart, slice by player
        count, ascension, game mode, or a single player. Aggregation happens server-side, so
        every view is a single small request.
      </p>
      <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">Loading…</div>}>
        <ChartsClient />
      </Suspense>
    </div>
  );
}
