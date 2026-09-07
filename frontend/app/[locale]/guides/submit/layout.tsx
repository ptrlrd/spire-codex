import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/guides/submit",
      title: "Submit a Guide - Slay the Spire 2 (sts2) | Spire Codex",
      description:
        "Submit a community strategy guide for Slay the Spire 2 (sts2). Share character guides, boss strategies, and deck-building tips with the Spire Codex community.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  return listMetadata(locale, {
    path: "/guides/submit",
    title: `${t("Submit a Guide")} - ${gameName} | Spire Codex (${LANG_NAMES[locale]})`,
    description: `${t("Submit a Guide")}, share character guides, boss strategies, and deck-building tips with the ${gameName} (${LANG_NAMES[locale]}) community on Spire Codex.`,
  });
}

export default function GuideSubmitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
