import type { Metadata } from "next";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import ProfileClient from "@/app/profile/ProfileClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  return {
    title: `${t("Profile", lang)} | Spire Codex`,
    description: "View your runs, upload run files, and see your personal stats.",
    robots: { index: false },
  };
}

export default async function LangProfilePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <ProfileClient />;
}
