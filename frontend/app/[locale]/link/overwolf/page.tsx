import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import LinkOverwolfClient from "./LinkOverwolfClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT(localeOf((await params).locale));
  return {
    title: `${t("Link Overwolf")} | Spire Codex`,
    robots: { index: false },
  };
}

export default function Page() {
  return <LinkOverwolfClient />;
}
