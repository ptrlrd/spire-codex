import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import AboutClient from "./AboutClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/about",
      title: "About Spire Codex - Slay the Spire 2 (sts2) Database | Spire Codex",
      description: t("about_tagline"),
    });
  }
  return listMetadata(locale, {
    path: "/about",
    title: `${t("About")} Spire Codex - ${gameNameFor(locale)} | (${LANG_NAMES[locale]})`,
    description: t("about_tagline"),
  });
}

export default function AboutPage() {
  return <AboutClient />;
}
