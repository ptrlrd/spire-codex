import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import ThankYouBody from "./ThankYouBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/thank-you",
      title: "Thank You - Slay the Spire 2 (sts2) | Spire Codex",
      description: "Thank you to the Slay the Spire 2 community, Ko-fi supporters, and contributors who help grow Spire Codex.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/thank-you",
    title: `${t("Thank You")} - ${gameName} | Spire Codex (${nativeName})`,
    description: `Thank you to the ${gameName} community, Ko-fi supporters, and contributors who help grow Spire Codex. ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <ThankYouBody lang={locale} />;
}
