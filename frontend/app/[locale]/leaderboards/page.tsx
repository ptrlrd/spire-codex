import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { Suspense } from "react";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import LeaderboardBrowseClient from "./LeaderboardBrowseClient";

export const dynamic = "force-dynamic";

const title = "Leaderboards - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Browse community-submitted Slay the Spire 2 (sts2) runs. Filter by character, ascension level, and outcome. View leaderboards and detailed run breakdowns.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Leaderboards")}`;
  const desc = t("leaderboards_tagline");
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("leaderboards_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/leaderboards", title: copy.title, description: copy.description });
}

export default async function ToolsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
    ]),
    buildCollectionPageJsonLd({
      name: locale === "eng" ? "Slay the Spire 2 Leaderboards" : copy.heading,
      description:
        locale === "eng" ? "Community-submitted runs across every character and ascension. Filter by character, ascension, and outcome." : copy.description,
      path: localePath(locale, "/leaderboards"),
      inLanguage: inLanguageOf(locale),
    }),
  ];

  // LeaderboardBrowseClient calls `useSearchParams()`, which opts the
  // whole tree out of static prerender and was preventing the JSON-LD
  // sibling from making it into the SSR HTML, GSC saw zero
  // structured data on /leaderboards. Wrapping the client component
  // in <Suspense> isolates the bailout so the JsonLd ships in the
  // initial server response.
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense>
        <LeaderboardBrowseClient />
      </Suspense>
    </>
  );
}
