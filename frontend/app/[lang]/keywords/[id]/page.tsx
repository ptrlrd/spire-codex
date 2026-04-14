import type { Metadata } from "next";
import KeywordDetail from "@/app/keywords/[id]/KeywordDetail";
import { stripTags, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Keyword Not Found - Spire Codex" };
    const kw = await res.json();
    const desc = stripTags(kw.description);
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const title = `${gameName} ${kw.name} Cards - All ${kw.name} Cards | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/keywords/${id}`, "x-default": `${SITE_URL}/keywords/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/keywords/${id}`;
    return {
      title,
      description: `${desc} Browse all ${kw.name} cards in ${gameName}.`,
      openGraph: {
        title: `${gameName} ${kw.name} Cards | Spire Codex (${LANG_NAMES[langCode]})`,
        description: `${desc} Browse all ${kw.name} cards in ${gameName}.`,
        locale: LANG_HREFLANG[langCode],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/keywords/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let kw = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}?lang=${lang}`);
    if (res.ok) {
      kw = await res.json();
      const desc = stripTags(kw.description);
      const langCode = lang as LangCode;
      const gameName = LANG_GAME_NAME[langCode];
      const detailJsonLd = buildDetailPageJsonLd({
        name: `${kw.name} Cards`,
        description: `${desc} All cards with the ${kw.name} keyword in ${gameName}.`,
        path: `/${lang}/keywords/${id}`,
        category: "Keyword",
        breadcrumbs: [
          { name: "Home", href: `/${lang}` },
          { name: "Keywords", href: `/${lang}/keywords` },
          { name: kw.name, href: `/${lang}/keywords/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${kw.name} do in ${gameName}?`, answer: desc },
        { question: `Which cards have ${kw.name}?`, answer: `View the full list of ${kw.name} cards on this page.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail initialResult={kw ? { type: "keyword", data: kw } : null} />
    </>
  );
}
