import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import ModifiersClient from "./ModifiersClient";

// Pure client component, no fetches, pre-rendered at build time and
// cached at CF edge indefinitely (modifier data only changes on deploy).

const title = "Custom Mode Modifiers - All Modifiers - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "All 16 Slay the Spire 2 (sts2) custom-mode modifiers, Draft, Sealed Deck, Insanity, and more. Effects, deck rules, and Neow interactions for each.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Modifiers")}`;
  const desc = `${gameName} ${t("Modifiers")} (${nativeName}). All 16 custom-mode modifiers, Draft, Sealed Deck, Insanity, and more. Effects, deck rules, and Neow interactions for each.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: desc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/modifiers", title: copy.title, description: copy.description });
}

export default async function ModifiersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Modifiers"), href: localePath(locale, "/modifiers") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Custom Mode Modifiers",
      description:
        "All 16 Slay the Spire 2 custom-mode modifiers, Draft, Sealed Deck, Insanity, and more. Effects, deck rules, and Neow interactions.",
      path: localePath(locale, "/modifiers"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <ModifiersClient />
    </>
  );
}
