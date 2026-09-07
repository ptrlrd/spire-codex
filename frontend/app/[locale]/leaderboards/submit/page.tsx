import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import SubmitRunClient from "./SubmitRunClient";

export const dynamic = "force-dynamic";

const title = "Submit a Run - Slay the Spire 2 | Spire Codex";
const description =
  "Upload your Slay the Spire 2 (sts2) run history. Drop .run files or paste JSON to share with the community and feed deck-choice and win-rate analytics.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Submit a Run")}`;
  const desc = t("submit_tagline");
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("submit_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/leaderboards/submit", title: copy.title, description: copy.description });
}

export default async function SubmitRunPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const jsonLd = buildBreadcrumbJsonLd([
    { name: t("Home"), href: localePath(locale, "/") },
    { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
    { name: t("Submit a Run"), href: localePath(locale, "/leaderboards/submit") },
  ]);
  return (
    <>
      <JsonLd data={jsonLd} />
      <SubmitRunClient />
    </>
  );
}
