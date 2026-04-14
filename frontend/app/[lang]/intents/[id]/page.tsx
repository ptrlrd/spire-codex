import type { Metadata } from "next";
import IntentDetail from "@/app/intents/[id]/IntentDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Intent Not Found - Spire Codex" };
    const entity = await res.json();
    const desc = stripTags(entity.description || "");
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || id;
    const title = `${gameName} ${name} - Intent | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/intents/${id}`, "x-default": `${SITE_URL}/intents/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/intents/${id}`;
    return {
      title,
      description: desc || `${name} - ${gameName}`,
      openGraph: { title, description: desc || `${name} - ${gameName}`, locale: LANG_HREFLANG[langCode] },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/intents/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let data = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/intents/${id}`,
        category: "Intent",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Reference", href: `/${lang}/reference` }, { name, href: `/${lang}/intents/${id}` }],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([{ question: `${name}?`, answer: desc || name }])];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <IntentDetail initialIntent={data} />
    </>
  );
}
