import { redirect } from "next/navigation";
import { isValidLang } from "@/lib/languages";

export default async function LangRunsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) redirect("/leaderboards");
  redirect(`/${lang}/leaderboards`);
}
