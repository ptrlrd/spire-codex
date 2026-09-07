import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import TermsBody from "./TermsBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/terms",
      title: "Terms of Service | Spire Codex",
      description: "Terms governing use of the Spire Codex website, API, embeddable widgets, and Overwolf overlay.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/terms",
    title: `${t("Terms of Service")} | Spire Codex (${nativeName})`,
    description: `${t("Terms governing use of the Spire Codex website, API, embeddable widgets, and Overwolf overlay.")} ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <TermsBody lang={locale} />;
}
