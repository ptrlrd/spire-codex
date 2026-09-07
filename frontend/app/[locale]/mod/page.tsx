import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import ModBody from "./ModBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/mod",
      title: "Steam Mod - Slay the Spire 2 (sts2) | Spire Codex",
      description: "The official Spire Codex mod for Slay the Spire 2, from the Steam Workshop. Automatic run uploads, in-game community insights, and a route planner.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/mod",
    title: `${gameName} ${t("Steam Mod")} | Spire Codex (${nativeName})`,
    description: `The official Spire Codex mod for ${gameName}, from the Steam Workshop. Automatic run uploads, in-game community insights, and a route planner. ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <ModBody lang={locale} />;
}
