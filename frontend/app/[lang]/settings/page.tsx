import type { Metadata } from "next";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import SettingsClient from "@/app/settings/SettingsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  return {
    title: `${t("Settings", lang)} | Spire Codex`,
    description: "Manage your display name, email, and connected accounts.",
    robots: { index: false },
  };
}

export default async function LangSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <SettingsClient />;
}
