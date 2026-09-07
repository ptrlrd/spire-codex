import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import { TierListBody } from "./TierListBody";

// Tier-list hub: scores refresh on the backend every 60s, so 5min
// HTML cache is comfortably fresh and lets CF serve from edge.
export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    // Title leads with both abbreviated ("STS2") and full game name to
    // match either query phrasing, the actual SERPs we're targeting use
    // both. Order chosen so the abbreviation lands inside the truncation
    // window on mobile (Google trims at ~60 chars on phones).
    return listMetadata("eng", {
      path: "/tier-list",
      title: "Tier List - Cards, Relics & Potions Ranked - Slay the Spire 2 (sts2) | Spire Codex",
      description:
        "Slay the Spire 2 (sts2) tier list ranking every card, relic, and potion S through F. Codex Score from community win rates. Updated daily after every patch.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  return listMetadata(locale, {
    path: "/tier-list",
    title: `${gameName} ${t("Tier List")} | Spire Codex (${LANG_NAMES[locale]})`,
    description: `${gameName} tier list ranking every card, relic, and potion S through F. Codex Score from community win rates. ${LANG_NAMES[locale]}.`,
  });
}

export default async function TierListIndex({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <TierListBody lang={locale} />;
}
