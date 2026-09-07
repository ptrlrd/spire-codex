import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import UnlocksClient from "./UnlocksClient";

const title = "Unlocks - All Unlockable Cards, Relics & Potions - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Complete list of all unlockable content in Slay the Spire 2, 60 cards, 45 relics, 21 potions, and 4 characters unlocked through timeline progression.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Unlocks")}`;
  const desc = `${gameName} unlocks (${nativeName}). All unlockable cards, relics, potions, and characters with their epoch progression and score thresholds.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: desc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/unlocks", title: copy.title, description: copy.description });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Unlocks"), href: localePath(locale, "/unlocks") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Unlocks",
      description:
        "All unlockable cards, relics, potions, and characters in Slay the Spire 2 with their epoch progression and score thresholds.",
      path: localePath(locale, "/unlocks"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <UnlocksClient />
    </>
  );
}
