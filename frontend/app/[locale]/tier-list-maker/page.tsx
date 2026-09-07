import type { Metadata } from "next";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import TierListHome from "./TierListHome";

type Props = { params: Promise<{ locale: string }> };

const DESCRIPTION =
  "Build and share Slay the Spire 2 tier lists. Drag and drop cards, relics, potions, and monsters into custom tiers.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  return listMetadata(locale, {
    path: "/tier-list-maker",
    title: locale === "eng" ? "Tier List Maker | Spire Codex" : `${gameNameFor(locale)} Tier List Maker | Spire Codex (${LANG_NAMES[locale]})`,
    description: DESCRIPTION,
  });
}

export default function Page() {
  return <TierListHome />;
}
