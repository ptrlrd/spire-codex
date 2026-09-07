import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, listMetadata, localeOf } from "@/lib/locale";
import KnowledgeDemonBody from "./KnowledgeDemonBody";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (locale === "eng") {
    return listMetadata("eng", {
      path: "/knowledge-demon",
      title: "Knowledge Demon - Slay the Spire 2 (sts2) Discord Bot | Spire Codex",
      description: "Knowledge Demon, a Discord bot for Slay the Spire 2 communities. Slash-command lookups for cards, relics, monsters, and events, plus moderation and news feeds.",
    });
  }
  const t = await getT(locale);
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  return listMetadata(locale, {
    path: "/knowledge-demon",
    title: `Knowledge Demon - ${gameName} Discord Bot | Spire Codex (${nativeName})`,
    description: `Knowledge Demon, a Discord bot for ${gameName} communities. Slash-command lookups for cards, relics, monsters, and events, plus moderation and news feeds. ${nativeName}.`,
  });
}

export default async function Page({ params }: Props) {
  const locale = localeOf((await params).locale);
  return <KnowledgeDemonBody lang={locale} />;
}
