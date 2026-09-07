import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import ExporterBody from "./ExporterBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/exporter",
      title: "Art Exporter - Slay the Spire 2 (sts2) | Spire Codex",
      description: "The tool that generates every image on Spire Codex, free on the Steam Workshop for Slay the Spire 2. Card renders, Spine character art, animations, and texture dumps.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/exporter",
    title: `${gameName} ${t("Art Exporter")} | Spire Codex (${nativeName})`,
    description: `The tool that generates every image on Spire Codex, free on the Steam Workshop for ${gameName}. Card renders, Spine character art, animations, and texture dumps. ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <ExporterBody lang={locale} />;
}
