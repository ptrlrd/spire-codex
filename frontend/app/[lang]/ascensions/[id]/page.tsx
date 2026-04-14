import type { Metadata } from "next";
import AscensionDetail from "@/app/ascensions/[id]/AscensionDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Ascension Not Found - Spire Codex" };
    const asc = await res.json();
    const desc = stripTags(asc.description);
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const title = `${gameName} Ascension ${asc.level}: ${asc.name} | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/ascensions/${id}`, "x-default": `${SITE_URL}/ascensions/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/ascensions/${id}`;
    return {
      title, description: `Ascension ${asc.level} (${asc.name}) in ${gameName}: ${desc}`,
      openGraph: { title, description: `Ascension ${asc.level}: ${desc}`, locale: LANG_HREFLANG[langCode] },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/ascensions/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let asc = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}?lang=${lang}`);
    if (res.ok) {
      asc = await res.json();
      const desc = stripTags(asc.description);
      const langCode = lang as LangCode;
      const gameName = LANG_GAME_NAME[langCode];
      const detailJsonLd = buildDetailPageJsonLd({
        name: `Ascension ${asc.level}: ${asc.name}`,
        description: `${desc} Ascension level ${asc.level} in ${gameName}.`,
        path: `/${lang}/ascensions/${id}`,
        category: "Ascension",
        breadcrumbs: [
          { name: "Home", href: `/${lang}` },
          { name: "Reference", href: `/${lang}/reference` },
          { name: `Ascension ${asc.level}`, href: `/${lang}/ascensions/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does Ascension ${asc.level} do in ${gameName}?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AscensionDetail initialAscension={asc} />
    </>
  );
}
