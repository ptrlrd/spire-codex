import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import PrivacyBody from "./PrivacyBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/privacy",
      title: "Privacy Policy | Spire Codex",
      description: "How Spire Codex collects, uses, and retains data submitted through the website, API, and Overwolf overlay.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/privacy",
    title: `${t("Privacy Policy")} | Spire Codex (${nativeName})`,
    description: `${t("How Spire Codex collects, uses, and retains data submitted through the website, API, and Overwolf overlay.")} ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <PrivacyBody lang={locale} />;
}
