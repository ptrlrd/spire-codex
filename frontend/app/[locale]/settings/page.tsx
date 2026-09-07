import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT(localeOf((await params).locale));
  return {
    title: `${t("Settings")} | Spire Codex`,
    description: "Manage your display name, email, and connected accounts.",
    robots: { index: false },
  };
}

export default function Page() {
  return <SettingsClient />;
}
