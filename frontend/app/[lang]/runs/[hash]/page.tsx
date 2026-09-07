import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLang } from "@/lib/languages";
import SharedRunPage, { generateMetadata as runMetadata } from "@/app/runs/[hash]/page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; hash: string }> };

// Localized run pages render in the viewer's language (the [lang] layout
// seeds the language provider) instead of redirecting to English, which
// reset the viewer's language every time they opened a run. The English URL
// is canonical and these are noindex, which is what keeps the ~5,000
// duplicate-without-canonical pages the old redirect was added for out of
// the index.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) notFound();
  const base = await runMetadata({ params: Promise.resolve({ hash }) });
  return { ...base, robots: { index: false, follow: true } };
}

export default async function LangSharedRunPage({ params }: Props) {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) notFound();
  return <SharedRunPage params={Promise.resolve({ hash })} />;
}
