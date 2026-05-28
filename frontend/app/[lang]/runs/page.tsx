import { redirect } from "next/navigation";
import { isValidLang } from "@/lib/languages";
import BrowseRunsClient from "../../runs/BrowseRunsClient";

export default async function LangRunsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) redirect("/runs");
  return <BrowseRunsClient />;
}
