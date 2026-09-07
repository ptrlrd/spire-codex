import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import ChartsClient from "./ChartsClient";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Run Charts", title: `Run Charts - Slay the Spire 2 (sts2) | ${SITE_NAME}`, description: "Interactive charts over community-submitted Slay the Spire 2 runs: win rate by floor, ascension and over time, damage per encounter, run stat distributions and scatters. Filter by player count, ascension, game mode, or a single player.", tagline: "Interactive aggregates over community-submitted runs. Pick a chart, slice by player count, ascension, game mode, or a single player. Aggregation happens server-side, so every view is a single small request." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Run Charts")}`;
  const desc = `${gameName} ${t("Run Charts")} (${nativeName}).`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: desc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/charts", title: copy.title, description: copy.description });
}

export default async function ChartsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
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
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>
      <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">{t("Loading…")}</div>}>
        <ChartsClient />
      </Suspense>
    </div>
  );
}
