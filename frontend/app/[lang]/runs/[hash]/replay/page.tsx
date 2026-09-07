import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLang } from "@/lib/languages";
import ReplayPage, { generateMetadata as replayMetadata } from "@/app/runs/[hash]/replay/page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; hash: string }> };

// Localized replay pages render in the viewer's language (the [lang] layout
// seeds the language provider) instead of redirecting to English, which
// dropped the viewer's language on every visit. The English URL is canonical
// and these are noindex, so they add no duplicate to the index.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) notFound();
  const base = await replayMetadata({ params: Promise.resolve({ hash }) });
  return { ...base, robots: { index: false, follow: true } };
}

export default async function LangReplayPage({ params }: Props) {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) notFound();
  return <ReplayPage params={Promise.resolve({ hash })} />;
}
