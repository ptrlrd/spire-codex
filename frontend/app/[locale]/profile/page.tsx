import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import ProfileClient from "./ProfileClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT(localeOf((await params).locale));
  return {
    title: `${t("Profile")} | Spire Codex`,
    description: "View your runs, upload run files, and see your personal stats.",
    robots: { index: false },
  };
}

export default function Page() {
  return <ProfileClient />;
}
