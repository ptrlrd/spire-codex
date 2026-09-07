import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLang } from "@/lib/languages";
import SharedRunPage, { generateMetadata as runMetadata } from "@/app/runs/[hash]/page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; hash: string }> };

// Localized run pages render in the viewer's language (the [lang] layout
// seeds the language provider) instead of redirecting to English, which
// reset the viewer's language every time they opened a run. They stay out of
// the index: the English URL is canonical and the page is noindex, so the
// ~5,000 "Duplicate without user-selected canonical" pages the old redirect
// was added for can't come back.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) return {};
  const base = await runMetadata({ params: Promise.resolve({ hash }) });
  return { ...base, robots: { index: false, follow: false } };
}

export default async function LangSharedRunPage({ params }: Props) {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) notFound();
  return SharedRunPage({ params: Promise.resolve({ hash }) });
}
