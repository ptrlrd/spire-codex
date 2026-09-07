import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import OverlayBody from "./OverlayBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/overlay",
      title: "Overwolf Overlay - Slay the Spire 2 (sts2) | Spire Codex",
      description: "The Overwolf companion overlay for Slay the Spire 2. In-game card, relic, and monster lookups plus a live run tracker that reads your save file.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/overlay",
    title: `${gameName} ${t("Overlay")} | Spire Codex (${nativeName})`,
    description: `The Overwolf companion overlay for ${gameName}. In-game card, relic, and monster lookups plus a live run tracker that reads your save file. ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <OverlayBody lang={locale} />;
}
