import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import BrowseRunsClient from "./BrowseRunsClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/runs",
      title: "Browse Runs - Slay the Spire 2 (sts2) | Spire Codex",
      description:
        "Browse, search, and filter every Slay the Spire 2 run submitted to Spire Codex. Filter by character, ascension, username, seed, version, mode, and more.",
    });
  }
  const t = await getT(locale);
  return listMetadata(locale, {
    path: "/runs",
    title: `${gameNameFor(locale)} ${t("Browse Runs")} | Spire Codex (${LANG_NAMES[locale]})`,
    description: t("runs_tagline"),
  });
}

export default function RunsPage() {
  return <BrowseRunsClient />;
}
