import type { Metadata } from "next";
import { LANG_NAMES } from "@/lib/languages";
import { listMetadata, localeOf } from "@/lib/locale";
import GiveawayClient from "./GiveawayClient";

type Props = { params: Promise<{ locale: string }> };

const DESCRIPTION =
  "Enter to win a Slay the Spire 2 shadowbox. Sign in with Steam, get the mod, and upload a run. No purchase necessary. US residents only. July 7 to August 7, 2026.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const suffix = locale === "eng" ? "" : ` (${LANG_NAMES[locale]})`;
  return listMetadata(locale, {
    path: "/giveaway",
    title: `Slay the Spire 2 Shadowbox Giveaway | Spire Codex${suffix}`,
    description: DESCRIPTION,
  });
}

export default function GiveawayPage() {
  return <GiveawayClient />;
}
