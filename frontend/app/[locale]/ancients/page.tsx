import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import AncientsClient from "./AncientsClient";

export const revalidate = 3600;

const title = "Ancient Relic Pools - All Ancient Offerings - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Relic pools for all 8 Slay the Spire 2 (sts2) Ancients, Neow, Tezcatara, Pael, Orobas, Darv, Nonupeipe, Tanx, Vakuu. Every offering and condition.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Ancients")}`;
  const desc = `${gameName} Ancient relic pools (${nativeName}). Every offering and condition for all 8 Ancients, Neow, Tezcatara, Pael, Orobas, Darv, Nonupeipe, and more.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: desc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/ancients", title: copy.title, description: copy.description });
}

export default async function AncientsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Ancients"), href: localePath(locale, "/ancients") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Ancient Relic Pools",
      description:
        "Relic pools for all 8 Slay the Spire 2 Ancients, every offering and the conditions required to receive it.",
      path: localePath(locale, "/ancients"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <AncientsClient />
    </>
  );
}
