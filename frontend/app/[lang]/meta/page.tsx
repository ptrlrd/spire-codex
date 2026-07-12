import { redirect } from "next/navigation";
import { isValidLang } from "@/lib/languages";

// Mirrors the base /meta route, which redirects to the stats page.
// Keep the language prefix so non-English visitors land on the
// localized stats view instead of the canonical English one.
export default async function LangMetaPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isValidLang(lang) ? `/${lang}/leaderboards/stats` : "/leaderboards/stats");
}
